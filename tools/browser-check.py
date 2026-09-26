#!/usr/bin/env python3
"""
tools/browser-check.py — 模板演示的浏览器实际验证（Python Playwright，trusted 键盘事件）

验证对象：静态服务下的模板演示页（默认 /examples/canvas-slice/）。
用法：
  python tools/browser-check.py                      # 验证开发仓库的演示切片
  python tools/browser-check.py --root <项目目录> --base /game/   # 验证 init 出的项目
  python tools/browser-check.py --root <旧版目录> --shots-only --prefix r3-before-  # 只采集截图

覆盖（行为断言）：真实按键（移动/跳跃/射击/暂停/恢复/重启）、暂停中输入不补发、
同帧双击 Esc 两次切换都完成、DOM HUD 横幅文案、?preset= 定格状态。
截图采集（不计入断言数，需人工过目）：dsf 1/1.25/1.5、420px 窄屏、320px 原生展示。
截图落 <开发仓库>/output/playwright/（--prefix 默认 r3-，不覆盖旧基线）。
行为断言失败以非 0 退出。

同帧双击 Esc 的确定性做法：两次 keydown/keyup 在同一个 JS 任务里同步派发
（同一帧入队两条 pressed）；判别利用暂停时 tick 冻结——派发前记下冻结值 t0，
谓词 paused === true && tick > t0 只有在"第一条 pressed 消费（恢复，tick 推进）、
第二条 pressed 也消费（再次暂停，tick 停在新值）"之后才可能成立；
若第二次点按被吞（旧缺陷），页面永远停在未暂停态，谓词超时即失败。
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
ASSERTS = []
CAPTURES = []


def report(name, ok, detail="", kind="assert"):
    (ASSERTS if kind == "assert" else CAPTURES).append((name, ok, detail))
    tag = "" if kind == "assert" else "（采集）"
    print(f"{'PASS' if ok else 'FAIL'}  {name}{tag}" + (f"  — {detail}" if detail else ""))


def shot(page, out, prefix, name):
    path = out / f"{prefix}{name}.png"
    page.screenshot(path=str(path))
    CAPTURES.append((name, True, path.name))
    print(f"SHOT  {path.name}（需人工过目）")


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


def open_page(browser, url, width=1280, height=800, dsf=1):
    page = browser.new_context(viewport={"width": width, "height": height},
                               device_scale_factor=dsf).new_page()
    page.goto(url)
    page.wait_for_function("window.__game !== undefined", timeout=15000)
    page.wait_for_timeout(200)
    return page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(REPO), help="静态服务根目录")
    ap.add_argument("--base", default="/examples/canvas-slice/", help="页面 URL 路径")
    ap.add_argument("--out", default=str(REPO / "output" / "playwright"), help="截图输出目录")
    ap.add_argument("--prefix", default="r3-", help="截图文件名前缀")
    ap.add_argument("--port", type=int, default=47863)
    ap.add_argument("--shots-only", action="store_true", help="只采集截图，不跑行为断言")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    root = Path(args.root).resolve()
    # 服务脚本优先用根目录自己的 tools/（仓库布局），否则用 init 项目的 vendor/pga/
    repo_script = root / "tools/static-server.mjs"
    server_script = str(repo_script) if repo_script.exists() else str(root / "vendor/pga/tools/static-server.mjs")
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
            page = open_page(browser, base_url)
            shot(page, out, args.prefix, "initial")

            if not args.shots_only:
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
                shot(page, out, args.prefix, "play")

                # 等子弹消散后暂停：横幅文案 + 状态
                page.wait_for_function("window.__game.state().bullets.length === 0", timeout=5000)
                page.keyboard.press("Escape")
                page.wait_for_function("window.__game.state().paused === true", timeout=1500)
                page.wait_for_timeout(100)
                title = page.locator('[data-hud="title"]').inner_text()
                visible = page.locator('[data-hud="banner"]').is_visible()
                report("暂停横幅", visible and title == "已暂停", f"title={title!r} visible={visible}")
                shot(page, out, args.prefix, "pause")

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

                # 同帧双击 Esc：同步派发保证同一帧入队两条 pressed；
                # 暂停时 tick 冻结，paused && tick>t0 只有在两次切换都完成后才成立
                page.keyboard.press("Escape")
                page.wait_for_function("window.__game.state().paused === true", timeout=1500)
                t_frozen = state(page)["tick"]
                page.evaluate("""() => {
                  for (let i = 0; i < 2; i++) {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true }));
                    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', cancelable: true }));
                  }
                }""")
                try:
                    page.wait_for_function(
                        f"window.__game.state().paused === true && window.__game.state().tick > {t_frozen}",
                        timeout=3000)
                    report("同帧双击 Esc 两次切换都完成", True,
                           f"tick {t_frozen} → {state(page)['tick']}，最终回到暂停")
                except Exception:
                    report("同帧双击 Esc 两次切换都完成", False,
                           "未观察到两次切换（第二次点按被吞或状态异常）")
                page.keyboard.press("Escape")  # 恢复，供后续步骤
                page.wait_for_function("window.__game.state().paused === false", timeout=1500)

                # 重启
                tick_before = state(page)["tick"]
                page.keyboard.press("r")
                page.wait_for_function(f"window.__game.state().tick < {max(5, tick_before // 2)}", timeout=1500)
                s = state(page)
                report("真实按键重启", s["status"] == "playing" and s["shield"] == 3,
                       f"tick {tick_before}→{s['tick']}")

            # 预设定格（shots-only 模式只截图不断言）
            for preset, expect in [("fight", "playing"), ("win", "win"), ("contact", "playing")]:
                pg = open_page(browser, f"{base_url}?preset={preset}")
                if not args.shots_only:
                    st = state(pg)
                    ok = st["status"] == expect
                    if preset == "fight":
                        ok = ok and len(st["bullets"]) > 0
                    if preset == "contact":
                        ok = ok and st["shield"] < 3
                    if preset == "win":
                        ok = ok and pg.locator('[data-hud="title"]').inner_text() == "任务完成"
                    report(f"预设 {preset}", ok, f"status={st['status']}")
                shot(pg, out, args.prefix, f"preset-{preset}")
                pg.context.close()

            # 非整数设备缩放（玩场景定格 fight 更有信息量）
            for dsf, tag in [(1.25, "dsf125"), (1.5, "dsf150")]:
                pg = open_page(browser, f"{base_url}?preset=fight", dsf=dsf)
                shot(pg, out, args.prefix, f"fight-{tag}")
                pg.context.close()

            # 320px 原生展示尺寸（场景像素 1:1）：游玩态与暂停横幅
            pg = open_page(browser, base_url, width=320, height=700)
            shot(pg, out, args.prefix, "native-320-play")
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(200)
            shot(pg, out, args.prefix, "native-320-pause")
            pg.context.close()

            # 420px 窄屏
            pg = open_page(browser, base_url, width=420, height=800)
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(200)
            shot(pg, out, args.prefix, "narrow-pause")
            pg.context.close()

            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    bad = [r for r in ASSERTS if not r[1]]
    print(f"\n行为断言 {len(ASSERTS) - len(bad)}/{len(ASSERTS)} 通过；"
          f"截图采集 {len(CAPTURES)} 张在 {out}（需人工过目）")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
