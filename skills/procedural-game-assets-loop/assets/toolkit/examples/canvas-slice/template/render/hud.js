/** DOM 文字保持 CSS 像素尺寸，不经过低分辨率场景放大。 */
export function hudText(state) {
  return {
    stats: `护盾 ${state.shield} · 剩余目标 ${state.enemies.filter((e) => e.alive).length}`,
    title: state.paused ? '已暂停' : state.status === 'win' ? '任务完成' : state.status === 'fail' ? '任务失败' : '',
    hint: state.paused ? '按 Esc 继续 · 按 R 重启' : state.status !== 'playing' ? '按 R 重启' : '',
  };
}

export function updateHud(root, state) {
  const text = hudText(state);
  for (const key of ['stats', 'title', 'hint']) {
    root.querySelector(`[data-hud="${key}"]`).textContent = text[key];
  }
  root.querySelector('[data-hud="banner"]').hidden = !text.title;
}
