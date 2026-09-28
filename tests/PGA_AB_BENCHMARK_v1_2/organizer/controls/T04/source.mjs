// Editable low-level drawing recipe; same starting pixels as the D fixture.
// Use existing raster/geometry/bake APIs. This is not a Studio document.
export function build(api) {
  const { PixelPainter, packColor, Rng, partSeed, assembleFrame, assembleAsset } = api;
  const id = "medkit";
  const seed = 640917;
  const main = new PixelPainter(38, 34, { clip: 'error' });

  // Component: medkit.handle
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [14, 2, 10, 4];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: medkit.shell
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [4, 7, 30, 23];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: medkit.plate
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#29313b", "#3b4858", "#536276", "#77899c"].map(c => packColor(c));
    const [x,y,w,h] = [11, 11, 16, 14];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: medkit.symbol
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#4a3410", "#9c7420", "#ffb13d", "#ffe08a"].map(c => packColor(c));
    const vertices = [[19, 15], [16, 13], [14, 15], [14, 18], [19, 22], [24, 18], [24, 15], [22, 13]];
    p.poly(vertices, shades[1]);
    main.blit(p,0,0);
  }

  // Component: medkit.latch
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [6, 15, 2, 7];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }
  const frame = assembleFrame(id, main, {
    outline: "#120d16",
    anchor: {"x": 19.0, "y": 32},
    attachments: {"handle": {"x": 19, "y": 3}}
  });
  return assembleAsset({id, kind:'prop', seed, frames:[frame], clips:{}});
}
