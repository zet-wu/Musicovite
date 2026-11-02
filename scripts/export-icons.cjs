const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const iconGen = require('icon-gen');
const root = path.resolve(__dirname, '../build/branding');
const sizes = [16,20,24,32,40,48,64,96,128,192,256,512,1024];
const traySizes = [16,20,22,24,32,40,44,48,64];
const write = (name, data) => { const p=path.join(root,name); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,data); };
const render = (svg,size) => new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();

// 椭圆孔沿用原稿倾斜，仅为托盘放大，避免小尺寸下消失。
function hole(cx,cy) {
    const k=0.5522847498, s=1.35;
    const a=[39.45*s,0], b=[-6.95*s,40*s];
    const pt=(u,v)=>`${(cx+u*a[0]+v*b[0]).toFixed(4)},${(cy+u*a[1]+v*b[1]).toFixed(4)}`;
    return `M${pt(1,0)} C${pt(1,k)} ${pt(k,1)} ${pt(0,1)} C${pt(-k,1)} ${pt(-1,k)} ${pt(-1,0)} C${pt(-1,-k)} ${pt(-k,-1)} ${pt(0,-1)} C${pt(k,-1)} ${pt(1,-k)} ${pt(1,0)} Z`;
}
async function main() {
    const source=path.join(root,'musicovite.svg');
    if (!fs.existsSync(source)) throw new Error('缺少正式 Logo 源稿: ' + source);
    const svg=fs.readFileSync(source,'utf8');
    for(const n of sizes) write(`png/${n}.png`,render(svg,n));
    await iconGen(path.join(root,'png'),root,{ico:{name:'musicovite',sizes:[16,24,32,48,64,128,256]},icns:{name:'musicovite',sizes:[16,32,64,128,256,512,1024]}});
    for(const n of traySizes) write(`tray/color/${n}.png`,render(svg,n));
    await iconGen(path.join(root,'tray/color'),path.join(root,'tray'),{ico:{name:'musicovite-tray',sizes:[16,24,32,48,64]}});
    for(const [variant,color] of [['black','#000000'],['white','#FFFFFF']]) {
        let mono=svg.replace(/<g id="background">[\s\S]*?<\/g>/,'').replace(/<linearGradient[\s\S]*?<\/linearGradient>/g,'');
        mono=mono.replace(/<path id="(rear|front)-plate-path"[\s\S]*?d="([^"]+)"\s*\/>/g,(_,layer,d)=>{
            const outline=d.slice(0,d.search(/z\s*M/i)+1);
            return `<path id="${layer}-plate-path" fill="${color}" opacity="${layer==='rear'?0.62:1}" fill-rule="evenodd" d="${outline} ${layer==='rear'?hole(-8.5,62):hole(23.3,-26)}"/>`;
        });
        write(`tray/${variant}.svg`,mono);
        for(const n of traySizes) write(`tray/${variant}/${n}.png`,render(mono,n));
        if(variant==='black') {
            write('tray/mac/musicoviteTemplate.png',render(mono,22));
            write('tray/mac/musicoviteTemplate@2x.png',render(mono,44));
        }
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
