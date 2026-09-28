// Editable low-level drawing recipe; same starting pixels as the D fixture.
// Use existing raster/geometry/bake APIs. This is not a Studio document.
export function build(api) {
  const { PixelPainter, packColor, Rng, partSeed, assembleFrame, assembleAsset } = api;
  const id = "beacon";
  const seed = 640917;
  const main = new PixelPainter(38, 38, { clip: 'error' });

  // Component: beacon.base
  {
    const p = new PixelPainter(38, 38, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [9, 30, 20, 4];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: beacon.body
  {
    const p = new PixelPainter(38, 38, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [12, 17, 14, 14];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: beacon.mast
  {
    const p = new PixelPainter(38, 38, { clip: 'error' });
    const shades = ["#29313b", "#3b4858", "#536276", "#77899c"].map(c => packColor(c));
    const [x,y,w,h] = [18, 9, 3, 12];
    p.rect(x,y,w,h,shades[1]);
    main.blit(p,0,0);
  }

  // Component: beacon.light
  {
    const p = new PixelPainter(38, 38, { clip: 'error' });
    const shades = ["#4a3410", "#9c7420", "#ffb13d", "#ffe08a"].map(c => packColor(c));
    const [cx,cy,rx,ry] = [19, 8, 5, 4];
    p.ellipse(cx,cy,rx,ry,shades[1]);
    main.blit(p,0,0);
  }

  // Component: beacon.battery
  {
    const p = new PixelPainter(38, 38, { clip: 'error' });
    const shades = ["#29313b", "#3b4858", "#536276", "#77899c"].map(c => packColor(c));
    const [x,y,w,h] = [26, 23, 5, 8];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }
  const frame = assembleFrame(id, main, {
    outline: "#120d16",
    anchor: {"x": 19.0, "y": 36},
    attachments: {}
  });
  return assembleAsset({id, kind:'prop', seed, frames:[frame], clips:{}});
}
