import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const file=(name)=>readFileSync(new URL("../"+name, import.meta.url),"utf8");
const html=file("public/index.html");
const js=file("public/install-guide.js");
const css=file("public/install-guide.css");

test("V1.1 phone navigation and non-blocking install tutorial markup",()=>{
  assert.match(html,/data-nav="library" class="active"[^>]*>[\s\S]*?首页<\/button>/);
  assert.match(html,/id="view-account"[\s\S]*?id="openInstallGuide"/);
  assert.match(html,/id="installGuideDialog"/);
  assert.match(html,/role="tablist"[^>]*aria-label="设备类型"/);
  assert.match(html,/id="installGuideIphone"/);
  assert.match(html,/id="installGuideAndroid"/);
  assert.match(html,/建议先使用手机自带浏览器打开网站，再按照以上步骤操作。/);
  assert.doesNotMatch(html,/从小红书打开？/);
  assert.match(html,/\/install-guide\.css\?v=/);
  assert.match(html,/\/install-guide\.js\?v=/);
  assert.doesNotMatch(html,/apple-touch-icon|manifest\.webmanifest/);
  assert.doesNotThrow(()=>new Script(js,{filename:"install-guide.js"}));
  assert.match(css,/\.install-guide-panel\[hidden\]/);
});
test("V1.1 switch device, close, and re-open on demand",()=>{
  const names=["installGuideDialog","openInstallGuide","installGuideClose",
    "installGuideIphoneTab","installGuideAndroidTab",
    "installGuideIphone","installGuideAndroid"];
  const elements=Object.fromEntries(names.map(id=>[id,{
    id, hidden:false, open:false, isConnected:true, tabIndex:0,
    attrs:{},listeners:{},
    setAttribute(k,v){this.attrs[k]=v;if(k==="open")this.open=true;},
    removeAttribute(k){delete this.attrs[k];if(k==="open")this.open=false;},
    getAttribute(k){return this.attrs[k];},
    addEventListener(event,fn){this.listeners[event]=fn;},
    focus(){this.wasFocused=true;},
    showModal(){this.open=true;},
    close(){this.open=false;this.listeners.close?.();}
  }]));
  const document={
    activeElement:elements.openInstallGuide,
    getElementById:(id)=>elements[id]||null
  };
  const window={};
  new Script(js).runInNewContext({document,window});
  const fire=(id,event,detail={})=>elements[id].listeners[event]({target:elements[id],preventDefault(){},...detail});
  assert.equal(typeof window.MiaowuInstallGuide.open,"function");
  fire("openInstallGuide","click");
  assert.equal(elements.installGuideDialog.open,true);
  assert.equal(elements.installGuideIphone.hidden,false);
  assert.equal(elements.installGuideAndroid.hidden,true);
  fire("installGuideAndroidTab","click");
  assert.equal(elements.installGuideAndroidTab.getAttribute("aria-selected"),"true");
  assert.equal(elements.installGuideIphone.hidden,true);
  assert.equal(elements.installGuideAndroid.hidden,false);
  fire("installGuideClose","click");
  assert.equal(elements.installGuideDialog.open,false);
  assert.equal(elements.openInstallGuide.wasFocused,true);
  window.MiaowuInstallGuide.open();
  assert.equal(elements.installGuideIphone.hidden,false);
});
