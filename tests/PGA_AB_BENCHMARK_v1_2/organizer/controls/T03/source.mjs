// Editable low-level drawing recipe; same starting pixels as the D fixture.
// Use existing raster/geometry/bake APIs. This is not a Studio document.
export function build(api) {
  const { PixelPainter, packColor, Rng, partSeed, assembleFrame, assembleAsset } = api;
  const id = "cutter";
  const seed = 640917;
  const main = new PixelPainter(30, 30, { clip: 'error' });

  // Component: cutter.handle
  {
    const p = new PixelPainter(30, 30, { clip: 'error' });
    const shades = ["#29313b", "#3b4858", "#536276", "#77899c"].map(c => packColor(c));
    const vertices = [[5, 26], [8, 27], [20, 13], [16, 10]];
    p.poly(vertices, shades[1]);
    main.blit(p,0,0);
  }

  // Component: cutter.jaw
  {
    const p = new PixelPainter(30, 30, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const vertices = [[14, 12], [20, 3], [27, 4], [26, 9], [22, 8], [20, 15]];
    p.poly(vertices, shades[1]);
    p.map((px,py)=>{
      const t=((px-14)+(py-3))/Math.max(1,23);
      return t<0.15?shades[3]:t<0.4?shades[2]:t<0.75?shades[1]:shades[0];
    });
    main.blit(p,0,0);
  }

  // Component: cutter.bolt
  {
    const p = new PixelPainter(30, 30, { clip: 'error' });
    const shades = ["#4a3410", "#9c7420", "#ffb13d", "#ffe08a"].map(c => packColor(c));
    const [x,y,w,h] = [7, 22, 3, 3];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }
  const frame = assembleFrame(id, main, {
    outline: "#120d16",
    anchor: {"x": 15.0, "y": 28},
    attachments: {"grip": {"x": 10, "y": 22}, "tip": {"x": 26, "y": 5}}
  });
  return assembleAsset({id, kind:'prop', seed, frames:[frame], clips:{}});
}
