// Editable low-level drawing recipe; same starting pixels as the D fixture.
// Use existing raster/geometry/bake APIs. This is not a Studio document.
export function build(api) {
  const { PixelPainter, packColor, Rng, partSeed, assembleFrame, assembleAsset } = api;
  const id = "relay";
  const seed = 640917;
  const main = new PixelPainter(38, 34, { clip: 'error' });

  // Component: relay.base
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [8, 29, 22, 3];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: relay.shell
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#232830", "#49525f", "#707b8d", "#a6b0c2"].map(c => packColor(c));
    const [x,y,w,h] = [4, 3, 30, 26];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: relay.screen
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#04161d", "#0b3a46", "#177383", "#63dcd2"].map(c => packColor(c));
    const [x,y,w,h] = [7, 7, 16, 14];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[0]); p.rect(x,y+h-1,w,1,shades[0]);
    p.rect(x,y,1,h,shades[0]); p.rect(x+w-1,y,1,h,shades[0]);
    const rng = new Rng(partSeed(seed, 'studio/1:relay.screen'));
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

  // Component: relay.side
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#29313b", "#3b4858", "#536276", "#77899c"].map(c => packColor(c));
    const [x,y,w,h] = [26, 7, 5, 14];
    p.rect(x,y,w,h,shades[1]);
    p.rect(x,y,w,1,shades[2]); p.rect(x,y,1,h,shades[2]);
    p.rect(x,y+h-1,w,1,shades[0]); p.rect(x+w-1,y,1,h,shades[0]); p.set(x,y,shades[3]);
    main.blit(p,0,0);
  }

  // Component: relay.key
  {
    const p = new PixelPainter(38, 34, { clip: 'error' });
    const shades = ["#29313b", "#3b4858", "#536276", "#77899c"].map(c => packColor(c));
    const [x,y,w,h] = [8, 24, 6, 2];
    p.rect(x,y,w,h,shades[1]);
    main.blit(p,0,0);
  }
  const frame = assembleFrame(id, main, {
    outline: "#120d16",
    anchor: {"x": 19.0, "y": 32},
    attachments: {"screenCenter": {"x": 15, "y": 14}}
  });
  return assembleAsset({id, kind:'prop', seed, frames:[frame], clips:{}});
}
