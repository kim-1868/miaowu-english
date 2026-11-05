import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PRODUCTION_ASSET_ALLOWLIST,buildProductionAssets} from "../scripts/build-production-assets.mjs";
const data=(name)=>readFileSync(new URL("../public/"+name,import.meta.url));
const text=(name)=>data(name).toString("utf8");
function webpDimensions(bytes){
  assert.equal(bytes.toString("ascii",0,4),"RIFF");
  assert.equal(bytes.toString("ascii",8,12),"WEBP");
  assert.equal(bytes.toString("ascii",12,16),"VP8 ");
  return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
}
function avifDimensions(bytes){
  assert.equal(bytes.toString("ascii",4,12),"ftypavif");
  const start=bytes.indexOf(Buffer.from("ispe","ascii"));
  assert.ok(start>=0,"AVIF ispe extent must be present");
  return {width:bytes.readUInt32BE(start+8),height:bytes.readUInt32BE(start+12)};
}

test("S153: the tablet artwork has genuine 1400px WebP and 2800px high-DPI derivatives",()=>{
  assert.deepEqual(webpDimensions(data("cat-reading-tablet-1x.webp")),{width:1400,height:512});
  assert.deepEqual(webpDimensions(data("cat-reading-tablet-2x.webp")),{width:2800,height:1024});
  assert.deepEqual(avifDimensions(data("cat-reading-tablet-2x.avif")),{width:2800,height:1024});
  for(const file of ["cat-reading-tablet-1x.webp","cat-reading-tablet-2x.webp","cat-reading-tablet-2x.avif"]){
    assert.ok(data(file).length>20_000&&data(file).length<950_000,file);
    assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes(file),file);
  }
  const result=buildProductionAssets();
  assert.equal(result.assets.length,44);
});

test("S153: picture srcset chooses density appropriate assets and preserves old design interaction",()=>{
  const html=text("index.html"),css=text("styles.css"),app=text("app.js");
  assert.match(html,/srcset="\/cat-reading-hd\.avif\?v=20261104-v26-standard 1x, \/cat-reading-tablet-2x\.avif\?v=20261104-v26-retina 2x"/);
  assert.match(html,/src="\/cat-reading-tablet-1x\.webp\?v=20261104-v26-standard"/);
  assert.match(html,/srcset="\/cat-reading-tablet-1x\.webp\?v=20261104-v26-standard 1x, \/cat-reading-tablet-2x\.webp\?v=20261104-v26-retina 2x"/);
  assert.match(html,/href="\/styles\.css\?v=20261104-v28-night-selection"/);
  assert.match(html,/src="\/app\.js\?v=20261105-v30-flashcards"/);
  assert.match(css,/V26: tablet banner sharpness/);
  assert.match(css,/@media \(hover:none\), \(pointer:coarse\)/);
  assert.match(css,/will-change:auto!important/);
  assert.match(css,/\.home-scene-picture\{/);
  assert.match(app,/setupHomeSceneMotion\(\)/);
  assert.match(css,/mask-image:linear-gradient\(180deg/);
  assert.match(css,/@keyframes mw-rain-drift/);
});
