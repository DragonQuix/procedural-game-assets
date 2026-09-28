// Editable low-level drawing recipe; same starting pixels as the D fixture.
// Use existing raster/geometry/bake APIs. This is not a Studio document.
export function build(api) {
  const { PixelPainter, packColor, Rng, partSeed, assembleFrame, assembleAsset } = api;
  const id = "hauler";
  const seed = 640917;
  const main = new PixelPainter(38, 34, { clip: 'error' });

  // Component: hauler.base
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [6, 28, 26, 4];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: hauler.shell
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [8, 4, 22, 24];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: hauler.lens
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#04161d", "#0b3a46", "#177383", "#63dcd2"].map(c => packColor(c));
    const [x,y,w,h] = [15, 9, 8, 7];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[0]); p.rect(x,y+h-1,w,1,shades[0]);
    p.rect(x,y,1,h,shades[0]); p.rect(x+w-1,y,1,h,shades[0]);
    const rng = new Rng(partSeed(seed, 'studio/1:hauler.lens'));
    for (let j=y+1;j<y+h-1;j++) if ((j-y)%3===0) p.rect(x+1,j,w-2,1,shades[0]);
    for (let gy=y+2;gy<=y+h-3;gy+=2) {
      let cx=x+2;
      while(cx<x+w-3) {
        if(rng.next()<0.55) {
          const len=1+Math.floor(rng.next()*3);
          p.rect(cx,gy,Math.min(len,x+w-2-cx),1,rng.next()<0.8?shades[2]:shades[3]);
          cx+=len+1;
        } else cx+=2;
      }
    }
    main.blit(p,0,0);
  }

  // Component: hauler.badge
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#4a3410", "#9c7420", "#ffb13d", "#ffe08a"].map(c => packColor(c));
    const [x,y,w,h] = [17, 20, 4, 3];
    p.rect(x,y,w,h,shades[1]);
    main.blit(p,0,0);
  }
  const frame = assembleFrame(id, main, {
    outline: "#120d16",
    anchor: {"x": 19.0, "y": 32},
    attachments: {"sensor": {"x": 19, "y": 12.5}}
  });
  return assembleAsset({id, kind:'prop', seed, frames:[frame], clips:{}});
}
