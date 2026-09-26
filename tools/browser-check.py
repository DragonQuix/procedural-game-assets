#!/usr/bin/env python3
"""
tools/browser-check.py — 模板演示的浏览器实际验证（Python Playwright，trusted 键盘事件）

验证对象：静态服务下的模板演示页（默认 /examples/canvas-slice/）。
用法：
  python tools/browser-check.py                      # 验证开发仓库的演示切片
  python tools/browser-check.py --root <项目目录> --base /game/   # 验证 init 出的项目

覆盖：真实按键（移动/跳跃/射击/暂停/恢复/重启）、暂停中输入不补发、
同帧双击 Esc 不吞事件、DOM HUD 横幅文案、?preset= 定格、
dsf 1/1.25/1.5 与窄屏截图。截图落 <开发仓库>/output/playwright/（r3- 前缀，
不覆盖旧基线）。断言失败以非 0 退出；截图始终是主要证据，需人工过目。
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
RESULTS = []


def report(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def wait_server(url, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.2)
    return False


def state(page):
    return json.loads(page.evaluate("JSON.stringify(window.__game.state())"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(REPO), help="静态服务根目录")
    ap.add_argument("--base", default="/examples/canvas-slice/", help="页面 URL 路径")
    ap.add_argument("--out", default=str(REPO / "output" / "playwright"), help="截图输出目录")
    ap.add_argument("--port", type=int, default=47863)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    root = Path(args.root).resolve()
    server_script = "tools/static-server.mjs" if root == REPO else str(root / "vendor/pga/tools/static-server.mjs")
    server = subprocess.Popen(
        ["node", server_script, ".", str(args.port)],
        cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base_url = f"http://127.0.0.1:{args.port}{args.base}"
    try:
        if not wait_server(base_url):
            print(f"错误：静态服务未就绪 {base_url}")
            return 2

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1).new_page()
            page.goto(base_url)
            page.wait_for_function("window.__game !== undefined", timeout=15000)
            page.wait_for_timeout(200)
            page.screenshot(path=str(out / "r3-initial.png"))

            # 真实按键：右移
            x0 = state(page)["player"]["x"]
            page.keyboard.down("ArrowRight")
            page.wait_for_timeout(300)
            page.keyboard.up("ArrowRight")
            x1 = state(page)["player"]["x"]
            report("真实按键右移", x1 > x0, f"x {x0} → {x1}")

            # 真实按键：跳跃（滞空瞬间）
            y0 = state(page)["player"]["y"]
            page.keyboard.press("k")
            try:
                page.wait_for_function(
                    f"window.__game.state().player.y < {y0}", timeout=1500)
                report("真实按键跳跃", True, f"y0={y0}")
            except Exception:
                report("真实按键跳跃", False, f"y 未低于 {y0}")

            # 真实按键：射击
            page.wait_for_timeout(600)  # 等落地
            page.keyboard.press("j")
            try:
                page.wait_for_function("window.__game.state().bullets.length > 0", timeout=1500)
                report("真实按键射击", True)
            except Exception:
                report("真实按键射击", False, "无在途子弹")
            page.screenshot(path=str(out / "r3-play.png"))

            # 等子弹消散后暂停：横幅文案 + 状态
            page.wait_for_function("window.__game.state().bullets.length === 0", timeout=5000)
            page.keyboard.press("Escape")
            page.wait_for_function("window.__game.state().paused === true", timeout=1500)
            page.wait_for_timeout(100)
            title = page.locator('[data-hud="title"]').inner_text()
            visible = page.locator('[data-hud="banner"]').is_visible()
            report("暂停横幅", visible and title == "已暂停", f"title={title!r} visible={visible}")
            page.screenshot(path=str(out / "r3-pause.png"))

            # 暂停中输入：射击/移动不得补发
            x_pause = state(page)["player"]["x"]
            page.keyboard.press("j")
            page.keyboard.down("ArrowRight")
            page.wait_for_timeout(150)
            page.keyboard.up("ArrowRight")
            page.keyboard.press("Escape")  # 恢复
            page.wait_for_function("window.__game.state().paused === false", timeout=1500)
            page.wait_for_timeout(120)
            s = state(page)
            report("暂停中输入不补发", s["bullets"] == [] and abs(s["player"]["x"] - x_pause) < 0.01,
                   f"bullets={len(s['bullets'])} x {x_pause}→{s['player']['x']}")

            # 快速双击 Esc：暂停再恢复，两次 pressed 都不被吞
            page.keyboard.press("Escape")
            page.keyboard.press("Escape")
            try:
                page.wait_for_function("window.__game.state().paused === false", timeout=1500)
                report("双击 Esc 净结果为恢复", True)
            except Exception:
                report("双击 Esc 净结果为恢复", False, "仍处暂停（第二次点按被吞）")

            # 重启
            tick_before = state(page)["tick"]
            page.keyboard.press("r")
            page.wait_for_function(f"window.__game.state().tick < {max(5, tick_before // 2)}", timeout=1500)
            s = state(page)
            report("真实按键重启", s["status"] == "playing" and s["shield"] == 3,
                   f"tick {tick_before}→{s['tick']}")

            # 预设定格 + HUD 终局文案
            for preset, expect in [("fight", "playing"), ("win", "win"), ("contact", "playing")]:
                pg = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
                pg.goto(f"{base_url}?preset={preset}")
                pg.wait_for_function("window.__game !== undefined", timeout=15000)
                pg.wait_for_timeout(200)
                st = state(pg)
                ok = st["status"] == expect
                if preset == "fight":
                    ok = ok and len(st["bullets"]) > 0
                if preset == "contact":
                    ok = ok and st["shield"] < 3
                if preset == "win":
                    ok = ok and pg.locator('[data-hud="title"]').inner_text() == "任务完成"
                pg.screenshot(path=str(out / f"r3-preset-{preset}.png"))
                report(f"预设 {preset}", ok, f"status={st['status']}")
                pg.context.close()

            # 非整数设备缩放（玩场景定格 fight 更有信息量）
            for dsf, tag in [(1.25, "dsf125"), (1.5, "dsf150")]:
                pg = browser.new_context(viewport={"width": 1280, "height": 800},
                                         device_scale_factor=dsf).new_page()
                pg.goto(f"{base_url}?preset=fight")
                pg.wait_for_function("window.__game !== undefined", timeout=15000)
                pg.wait_for_timeout(200)
                pg.screenshot(path=str(out / f"r3-fight-{tag}.png"))
                pg.context.close()
            report("非整数缩放截图", True, "r3-fight-dsf125/150.png（需人工过目）")

            # 窄屏
            pg = browser.new_context(viewport={"width": 420, "height": 800}).new_page()
            pg.goto(base_url)
            pg.wait_for_function("window.__game !== undefined", timeout=15000)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(200)
            pg.screenshot(path=str(out / "r3-narrow-pause.png"))
            pg.context.close()
            report("窄屏截图", True, "r3-narrow-pause.png（需人工过目）")

            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} 项通过；截图在 {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
