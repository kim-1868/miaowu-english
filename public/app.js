
  (()=>{
    'use strict';
    // Cloudflare D1 powers real test accounts; story content and learning state remain demo-only.
    const CATS=[{id:'cet4',en:'CET-4',name:'大学英语四级',sub:'核心词 · 故事精选',icon:'✦',available:true},{id:'cet6',en:'CET-6',name:'大学英语六级',sub:'更进一步 · 待推出',icon:'✧',available:false},{id:'postgrad',en:'POSTGRAD',name:'考研英语',sub:'学术与表达 · 待推出',icon:'❦',available:false},{id:'ielts',en:'IELTS',name:'雅思英语',sub:'世界阅读 · 待推出',icon:'✳',available:false}];
    const BOOKS=[{id:'rose',name:'玫瑰未落幕',desc:'一场错开的约定，一段尚未结束的故事。',kind:'one',tag:'离婚逆袭',illustration:'❦',status:'demo'},{id:'promise',name:'契约婚姻第七条',desc:'约定之外，有些心动从不遵守条款。',kind:'two',tag:'先婚后爱',illustration:'♧',status:'planned'},{id:'secret',name:'她的第二重身份',desc:'每一个名字的背后，都藏着未说出的故事。',kind:'three',tag:'身份反转',illustration:'✥',status:'planned'}];
    const WORDS={contract:{meaning:'合同；契约',phonetic:'/ˈkɒntrækt/',part:'n.',context:'她将那份 contract 轻轻推到桌面中央。'},indifferent:{meaning:'冷淡的；漠不关心的',phonetic:'/ɪnˈdɪfrənt/',part:'adj.',context:'他的神色看上去依旧 indifferent。'},confirm:{meaning:'确认；证实',phonetic:'/kənˈfɜːrm/',part:'v.',context:'她问他是否愿意 confirm 这个决定。'},hesitate:{meaning:'犹豫；迟疑',phonetic:'/ˈhezɪteɪt/',part:'v.',context:'她没有 hesitate，直接拿起了笔。'},signature:{meaning:'签名；署名',phonetic:'/ˈsɪɡnətʃər/',part:'n.',context:'协议上留下了她的 signature。'},evidence:{meaning:'证据；根据',phonetic:'/ˈevɪdəns/',part:'n.',context:'桌上还有一张可能成为 evidence 的照片。'},identity:{meaning:'身份；特征',phonetic:'/aɪˈdentəti/',part:'n.',context:'照片揭开了她的另一个 identity。'},transfer:{meaning:'转移；转让',phonetic:'/trænsˈfɜːr/',part:'v.',context:'新的文件涉及股份 transfer。'},reveal:{meaning:'揭示；透露',phonetic:'/rɪˈviːl/',part:'v.',context:'这封信也许会 reveal 更多线索。'},promise:{meaning:'承诺；答应',phonetic:'/ˈprɒmɪs/',part:'n./v.',context:'她想起曾经听到的 promise。'},approach:{meaning:'接近；方法',phonetic:'/əˈprəʊtʃ/',part:'v./n.',context:'脚步声从走廊另一端 approach。'},consequence:{meaning:'结果；后果',phonetic:'/ˈkɒnsɪkwəns/',part:'n.',context:'她知道，每个选择都有 consequence。'}};
    const WORD_EXTRAS={"contract": {"example": "The two companies signed a new contract.", "translation": "两家公司签署了一份新合同。", "collocations": [["sign a contract", "签订合同"], ["break a contract", "违反合同"]]}, "indifferent": {"example": "He seemed indifferent to her apology.", "translation": "他似乎对她的道歉无动于衷。", "collocations": [["be indifferent to", "对……漠不关心"], ["remain indifferent", "保持冷淡"]]}, "confirm": {"example": "Please confirm the meeting time.", "translation": "请确认会议时间。", "collocations": [["confirm a decision", "确认决定"], ["confirm details", "核实细节"]]}, "hesitate": {"example": "Do not hesitate to ask questions.", "translation": "请尽管提问，不必犹豫。", "collocations": [["hesitate to do", "犹豫是否做……"], ["without hesitation", "毫不犹豫地"]]}, "signature": {"example": "Please put your signature here.", "translation": "请在这里签名。", "collocations": [["put a signature", "签署姓名"], ["signature on a document", "文件上的签名"]]}, "evidence": {"example": "The police found new evidence.", "translation": "警方找到了新的证据。", "collocations": [["strong evidence", "有力证据"], ["provide evidence", "提供证据"]]}, "identity": {"example": "She kept her identity a secret.", "translation": "她对自己的身份保密。", "collocations": [["prove identity", "证明身份"], ["hidden identity", "隐藏身份"]]}, "transfer": {"example": "They plan to transfer the shares.", "translation": "他们计划转让股份。", "collocations": [["transfer ownership", "转让所有权"], ["transfer money", "转账"]]}, "reveal": {"example": "The letter may reveal the truth.", "translation": "这封信或许会揭示真相。", "collocations": [["reveal a secret", "透露秘密"], ["reveal the truth", "揭示真相"]]}, "promise": {"example": "She made a promise to her sister.", "translation": "她向妹妹许下了承诺。", "collocations": [["keep a promise", "遵守诺言"], ["break a promise", "违背诺言"]]}, "approach": {"example": "A stranger began to approach the door.", "translation": "一个陌生人开始靠近门口。", "collocations": [["approach a problem", "处理问题"], ["take an approach", "采用一种方法"]]}, "consequence": {"example": "Every choice has a consequence.", "translation": "每个选择都有后果。", "collocations": [["face the consequences", "面对后果"], ["serious consequences", "严重后果"]]}};
    Object.keys(WORD_EXTRAS).forEach(k=>Object.assign(WORDS[k],WORD_EXTRAS[k]));
    const CHAPTERS=[{title:'一纸协议',parts:['这只是一个用于测试阅读功能的场景片段，并非正式小说正文。窗外的雨敲打玻璃，客厅里只亮着一盏灯。','她将那份 [[contract]]（合同）轻轻推到桌面中央。对面的男人看上去依旧 [[indifferent]]（冷淡的），仿佛这不过是一次寻常的会面。','“我只想 [[confirm]]（确认）一件事。”她望着他，“这真的是你的决定吗？”','他没有回答。她也没有 [[hesitate]]（犹豫），拿起笔，在最后一页留下自己的 [[signature]]（签名）。','离开前，她发现文件下压着一张旧照片。也许，那会是一份重要的 [[evidence]]（证据）。']},{title:'藏在照片里的名字',parts:['这一章同样是临时交互文案，仅用于体验付费章节解锁与词汇功能。','照片背面的名字让她重新思考自己的 [[identity]]（身份）。那是一段不曾向任何人提起的往事。','律师寄来的邮件提到了股份 [[transfer]]（转让）。事情比她想象的复杂。','她将信纸折好，决定先不 [[reveal]]（透露）真相。某个遥远的 [[promise]]（承诺），仍然留在她的记忆里。','门外的脚步声逐渐 [[approach]]（接近）。她突然明白，每个决定都可能带来新的 [[consequence]]（后果）。']}];
    const QUIZ=[{q:'她把哪一种文件推到桌面中央？',hint:'提示：一份正式的书面约定。',choices:['contract','evidence','identity','promise'],correct:'contract',detail:'contract = 合同；契约。想起桌上的那份协议。'},{q:'她在文件最后一页留下了什么？',hint:'提示：这是签署协议时的一个动作。',choices:['approach','signature','transfer','reveal'],correct:'signature',detail:'signature = 签名。把词义和“落笔签字”的画面连在一起。'},{q:'他看上去冷淡的，哪个英文词更贴近？',hint:'提示：描述人物的态度。',choices:['indifferent','hesitate','confirm','consequence'],correct:'indifferent',detail:'indifferent = 冷淡的；漠不关心的。再次想起故事人物的神情。'}];
    const $=id=>document.getElementById(id);let view='library',category='cet4',chapter=0,gloss=true,night=(function(){try{return localStorage.getItem('miaowu_theme')==='dark'}catch(e){return false}})(),fontSize=18,wordFilter='all',popWord=null,user=null,grants=new Set(),quizIndex=0,quizScore=0,quizAnswer=null,utterances=[],speakIndex=0,speaking=false,paused=false;
    const stored=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return []}};const saved=new Set(stored('miaowu_demo_words').filter(w=>WORDS[w]));const mastered=new Set(stored('miaowu_demo_mastered').filter(w=>WORDS[w]));
    const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function applyTheme(){
      document.documentElement.setAttribute('data-theme',night?'dark':'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',night?'#211f25':'#f8f3ec');
      const globalToggle=$('globalThemeToggle'), readerToggle=$('toggleNight');
      if(globalToggle){globalToggle.querySelector('.theme-indicator').textContent=night?'☀':'☾';globalToggle.querySelector('.theme-label').textContent=night?'日间':'夜间';globalToggle.setAttribute('aria-label',night?'切换到日间模式':'切换到夜间模式')}
      if(readerToggle){readerToggle.textContent=night?'☀ 日间':'☾ 夜间';readerToggle.classList.toggle('pressed',night)}
      $('readerLayout')?.classList.toggle('night',night);
      try{localStorage.setItem('miaowu_theme',night?'dark':'light')}catch(e){}
    }
    function flipTheme(){night=!night;applyTheme()}
    const has=(id)=>!!user&&grants.has(id);const toast=(s)=>{const n=$('toast');n.textContent=s;n.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>n.classList.remove('show'),2700)};

    // v0.2 state. All data here is browser-local demo data, not production user records.
    const WORD_CHAPTER={};CHAPTERS.forEach((ch,i)=>ch.parts.join(' ').replace(/\[\[([a-z]+)\]\]/g,(_,w)=>{if(WORD_CHAPTER[w]===undefined)WORD_CHAPTER[w]=i;return ''}));
    const CHAPTER_WORDS=CHAPTERS.map(ch=>[...new Set([...ch.parts.join(' ').matchAll(/\[\[([a-z]+)\]\]/g)].map(m=>m[1]))]);
    const VISITED=new Set(stored('miaowu_v02_visited').filter(v=>Number.isInteger(v)));
    let reviewData=(()=>{try{return JSON.parse(localStorage.getItem('miaowu_v02_reviews')||'{}')}catch(e){return {}}})();
    const DAY=86400000;
    const dueList=()=>Object.keys(reviewData).filter(w=>WORDS[w]&&!mastered.has(w)&&reviewData[w].nextDue<=Date.now());
    const touchedWords=()=>[...new Set([...VISITED].flatMap(n=>CHAPTER_WORDS[n]||[]))];
    function saveReview(){try{localStorage.setItem('miaowu_v02_reviews',JSON.stringify(reviewData));localStorage.setItem('miaowu_v02_visited',JSON.stringify([...VISITED]))}catch(e){}}
    function touchWord(w){if(!WORDS[w])return;if(!reviewData[w])reviewData[w]={attempts:0,correct:0,streak:0,nextDue:Date.now()};saveReview()}
    function recordAnswer(w,ok,helped=false){touchWord(w);const r=reviewData[w];r.attempts++;if(ok)r.correct++;r.streak=ok&&!helped?r.streak+1:0;const intervals=[1,3,7,14,30];const days=ok?(helped?1:intervals[Math.min(r.streak-1,intervals.length-1)]):1;r.nextDue=Date.now()+days*DAY;if(r.streak>=4)mastered.add(w);else mastered.delete(w);saveReview();saveWords();renderReminder()}
    function renderReminder(){let el=$('reviewReminder');if(!el)return;const due=dueList().length;const touched=touchedWords().length;el.innerHTML=`<div class="reminder-cat" aria-hidden="true"><svg viewBox="0 0 48 48" width="30" height="30" fill="currentColor"><ellipse cx="12" cy="15" rx="4.1" ry="5.6" transform="rotate(-24 12 15)"/><ellipse cx="23" cy="10" rx="4.1" ry="5.6"/><ellipse cx="34" cy="15" rx="4.1" ry="5.6" transform="rotate(24 34 15)"/><ellipse cx="41" cy="25" rx="3.4" ry="4.6" transform="rotate(30 41 25)"/><path d="M23 23c-6.2 0-9.6 5-13 9.4-2.2 3-1 8.6 3.7 9.1 3.9.5 6.2-2.2 9.3-2.2 3.2 0 5.5 2.7 9.4 2.2 4.7-.5 5.9-6.1 3.7-9.1C32.6 28 29.2 23 23 23Z"/></svg></div><div class="reminder-content"><strong>${due?`喵呜，今天有 ${due} 个单词等你复习`:(touched?`今天的复习已经完成啦，继续读点新故事？`:'喵呜，欢迎来到你的故事书房')}</strong><small>${due?'用故事找回学过的词，还记得多少？':(touched?'已接触 '+touched+' 个目标词，复习任务会在这里提醒。':'读完试读章节后，你的待复习词汇会出现在这里。')}</small></div><button class="primary reminder-btn" id="reviewReminderBtn">${due?'开始今日复习 →': '打开剧情回声 →'}</button>`;$('reviewReminderBtn').onclick=()=>{echoScope=due?'due':'recent';echoPhase='setup';navigate('echo')};}
    const ECHO_TYPES=[{id:'fill',title:'剧情填词',desc:'在故事原句中选择恰当的英文词',symbol:'▤'},{id:'situation',title:'情境选择',desc:'根据人物行为和事件判断词义',symbol:'✧'},{id:'spell',title:'单词找回',desc:'键盘或平板系统手写拼出单词',symbol:'✎'}];
    const ECHO_BANK=[
      {type:'fill',ch:0,word:'contract',q:'她将那份 ______（合同）轻轻推到桌面中央。',choices:['contract','evidence','identity','promise']},
      {type:'fill',ch:0,word:'signature',q:'她在最后一页留下自己的 ______（签名）。',choices:['signature','transfer','promise','consequence']},
      {type:'fill',ch:1,word:'evidence',q:'那张照片可能成为一份重要的 ______（证据）。',choices:['evidence','promise','contract','identity']},
      {type:'fill',ch:1,word:'reveal',q:'她决定暂时不 ______（透露）真相。',choices:['confirm','hesitate','approach','reveal']},
      {type:'situation',ch:0,word:'indifferent',q:'男人对离婚协议似乎毫不在意，哪个词最适合描述他的态度？',choices:['indifferent','confirm','hesitate','approach']},
      {type:'situation',ch:0,word:'hesitate',q:'她不再犹豫，果断拿起笔签字。哪个英文词表示“犹豫”？',choices:['signature','hesitate','evidence','reveal']},
      {type:'situation',ch:1,word:'identity',q:'照片揭开了女主一直保守的身份秘密。哪个词表示“身份”？',choices:['identity','transfer','consequence','confirm']},
      {type:'situation',ch:1,word:'consequence',q:'她知道每个决定都可能带来后果。哪个词表示“后果”？',choices:['consequence','contract','approach','signature']},
      {type:'spell',ch:0,word:'contract',q:'她将那份 ______ 轻轻推到桌面中央。',hint:'合同 · 名词'},
      {type:'spell',ch:0,word:'confirm',q:'“我只想 ______ 一件事。”她望着他。',hint:'确认 · 动词'},
      {type:'spell',ch:0,word:'signature',q:'她在最后一页留下自己的 ______。',hint:'签名 · 名词'},
      {type:'spell',ch:1,word:'transfer',q:'律师的邮件提到了股份 ______。',hint:'转让 · 动词'},
      {type:'spell',ch:1,word:'promise',q:'某个遥远的 ______，仍留在记忆里。',hint:'承诺 · 名词'},
      {type:'spell',ch:1,word:'identity',q:'照片背面的名字让她重新思考自己的 ______。',hint:'身份 · 名词'}
    ];
    let echoScope='recent',echoTypes=new Set(['fill','situation','spell']),echoPhase='setup',echoChapterSet=new Set([0]),quizQuestions=[],quizHint=false;
    let echoCustomBook='all',echoCustomRange='all',echoRangeStart=1,echoRangeEnd=3;
    // Demo has one published book; the selector layout supports future books without one-by-one ticking.
    const availablePublishedBooks=()=>BOOKS.filter(b=>b.status==='demo');
    function echoAvailableChapters(){let read=[...VISITED].sort((a,b)=>a-b).filter(i=>i>=0&&i<CHAPTERS.length);return read.length?read:[0]}
    function echoCustomChapters(){
      let list=echoAvailableChapters();
      if(echoCustomBook!=='all'&&echoCustomBook!=='rose')return [];
      if(echoCustomRange==='recent3')return list.slice(-3);
      if(echoCustomRange==='recent10')return list.slice(-10);
      if(echoCustomRange==='range')return list.filter(i=>i+1>=Math.min(echoRangeStart,echoRangeEnd)&&i+1<=Math.max(echoRangeStart,echoRangeEnd));
      return list;
    }
    function quizPool(){
      let chapters=echoAvailableChapters();
      if(echoScope==='chapter')chapters=chapters.filter(i=>i===chapter);
      if(echoScope==='recent')chapters=chapters.slice(-3);
      if(echoScope==='custom')chapters=echoCustomChapters();
      const due=new Set(dueList());
      return ECHO_BANK.filter(q=>echoTypes.has(q.type)&&chapters.includes(q.ch)&&(echoScope!=='due'||due.has(q.word)));
    }
    function startEcho(){quizQuestions=quizPool().sort(()=>Math.random()-.5).slice(0,8);if(!quizQuestions.length){toast('这个范围暂时没有可练习的单词，试试最近章节');return}quizIndex=0;quizScore=0;quizAnswer=null;quizHint=false;echoPhase='playing';renderQuiz()}
    function asMeaning(c){return WORDS[c]?`${safe(c)}：${safe(WORDS[c].meaning)}`:safe(c)}
    function reportExamResult(q,ans,hint=false){if(quizAnswer!==null)return;quizAnswer=ans;const ok=ans.toLowerCase().trim()===q.word; if(ok)quizScore++;recordAnswer(q.word,ok,hint);renderQuiz()}

    function navigate(to){if(view==='echo'&&echoPhase==='playing'&&quizIndex<quizQuestions.length&&to!=='echo'){confirmEchoExit(to);return}if(view==='reader'&&to!=='reader')stopReading();view=to;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+to));document.querySelectorAll('[data-nav]').forEach(el=>{el.classList.toggle('on',el.dataset.nav===to);el.classList.toggle('active',el.dataset.nav===to)});window.scrollTo({top:0,behavior:'instant'});if(to==='library'){renderLibrary();renderReminder();}if(to==='words')renderWords();if(to==='echo')renderQuiz();if(to==='account')renderAccount();$('topAccount').textContent=user?('你好，'+user.name):'登录 / 激活'}
    function renderLibrary(){const cat=$('categories');cat.innerHTML=CATS.map(c=>`<button class="category ${c.id===category?'selected':''} ${c.available?'available':''}" data-category="${c.id}"><span class="category-en">${c.en}</span><span class="category-icon">${c.icon}</span><strong>${c.name}</strong><small>${c.sub}</small><span class="category-tag">${has(c.id)?'✓ 已解锁':c.available?'● 可试读':'即将上线'}</span></button>`).join('');document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{category=el.dataset.category;renderLibrary()});const picked=CATS.find(x=>x.id===category);$('selectedCategoryEn').textContent=picked.en+' · STORY COLLECTION';$('selectedCategoryTitle').textContent=picked.name+' · '+(category==='cet4'?'故事精选':'敬请期待');const list=$('bookGrid');if(category!=='cet4'){list.innerHTML=`<div class="onboarding" style="grid-column:1/-1;width:100%;margin:0"><span class="eyebrow">COMING SOON</span><h3>${picked.name} · 故事书架筹备中</h3><p>所有学习分类可见，但只有购买的分类能够阅读付费内容。当前原型只含四级的两章临时测试正文。</p><button class="secondary-btn" id="categoryReturn">返回四级体验 →</button></div>`;$('categoryReturn').onclick=()=>{category='cet4';renderLibrary()};return}list.innerHTML=BOOKS.map((b,i)=>{const published=CHAPTERS.length;const done=VISITED.size;const touched=touchedWords().length;const coverage=Object.keys(WORDS).length;const bar=b.status==='demo'?`<div class="shelf-progress"><div class="progress-text"><span>已读 ${done}/${published} 演示章</span><span>已接触 ${touched}/${coverage} 词</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.round(done/published*100)}%"></div></div></div>`:'<div class="shelf-progress"><div class="progress-text"><span>尚未开始 · 暂无内容</span><span>—</span></div></div>';return `<div class="book-item"><div class="book-cover ${b.kind}"><span class="book-tag">${b.status==='planned'?'筹备中':has('cet4')?'已解锁':'免费试读'}</span><span class="edition">THE STORY EDITION / 0${i+1}</span><span class="illustration">${b.illustration}</span><h3>${safe(b.name)}</h3><span class="edition-bottom">A STORY TO REMEMBER</span></div><div class="book-info"><div class="line1"><h3>${safe(b.name)}</h3><span class="eyebrow">0${i+1}</span></div><p>${safe(b.desc)}</p><div class="book-meta"><span class="pill">${safe(b.tag)}</span><span class="pill">${b.status==='planned'?'尚未制作':'2章演示'}</span></div>${bar}<div class="book-actions"><button ${b.status==='planned'?'disabled':''} class="${i===0?'primary':'secondary-btn'}" data-book="${b.id}">${b.status==='planned'?'尚未开放':done?'继续阅读 →':'开始试读 →'}</button></div></div></div>`}).join('');document.querySelectorAll('[data-book]').forEach(el=>el.onclick=()=>openChapter(Math.min(CHAPTERS.length-1,Math.max(0,...VISITED))))}
    function splitPart(txt){const rg=/\[\[([a-z]+)\]\]（([^）]+)）/g;let last=0,html='',m;while((m=rg.exec(txt))){html+=safe(txt.slice(last,m.index));html+=`<button class="word" data-word="${m[1]}">${m[1]}</button><span class="gloss">（${safe(m[2])}）</span>`;last=rg.lastIndex}return html+safe(txt.slice(last))}
    function openChapter(num){if(num>0&&!has('cet4')){showRegister({intent:'locked'});return}if(num<0||num>=CHAPTERS.length)return;chapter=num;VISITED.add(num);CHAPTER_WORDS[num].forEach(touchWord);saveReview();navigate('reader');$('chapterNo').textContent=`CHAPTER ${String(num+1).padStart(2,'0')} · ${num===0?'FREE PREVIEW':'MEMBER PREVIEW'}`;$('chapterTitle').textContent=CHAPTERS[num].title;$('storyText').innerHTML=CHAPTERS[num].parts.map(p=>`<p>${splitPart(p)}</p>`).join('');$('storyText').style.fontSize=fontSize+'px';$('readerCrumb').textContent='四级故事馆 / '+(num===0?'免费试读':'已购演示');$('chapterList').innerHTML=CHAPTERS.map((ch,i)=>`<button class="chapter-btn ${i===num?'current':''}" data-chapter="${i}">${String(i+1).padStart(2,'0')} · ${ch.title} ${i===1&&!has('cet4')?'🔒':''}</button>`).join('')+'<button class="chapter-btn" disabled>03–30 · 内容筹备中</button>';document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>openChapter(Number(b.dataset.chapter)));document.querySelectorAll('.word').forEach(b=>b.onclick=()=>openWord(b.dataset.word));$('readingStatus').textContent=has('cet4')?'四级已解锁 · 演示内容':'免费试读 · 章节02需激活';$('progressBar').style.width=(VISITED.size/CHAPTERS.length*100)+'%';$('readingChapter').textContent=`第${String(num+1).padStart(2,'0')}章`;$('savedCount').textContent=saved.size;$('nextChapter').textContent=num===0?'下一章 →':'返回书架 →';$('readerLayout').classList.toggle('night',night);$('storyText').classList.toggle('no-gloss',!gloss);$('toggleGloss').classList.toggle('pressed',!gloss);$('toggleNight').classList.toggle('pressed',night);$('toggleNight').textContent=night?'☀ 日间':'☾ 夜间';$('nextChapter').onclick=()=>num===0?openChapter(1):navigate('library');let side=$('readingStatus').closest('.side-panel');let extra=side.querySelector('#readerLearningStats');if(!extra){extra=document.createElement('div');extra.id='readerLearningStats';side.appendChild(extra)}extra.innerHTML=`<div class="metric"><span>待学习词汇（演示）</span><strong>${Object.keys(WORDS).length-touchedWords().length}</strong></div><div class="metric"><span>今天待复习</span><strong>${dueList().length}</strong></div>`;try{localStorage.setItem('miaowu_demo_lastchapter',String(num))}catch(e){} }
    function openWord(w){if(!WORDS[w])return;popWord=w;touchWord(w);const info=WORDS[w];$('wordPop').innerHTML=`<button class="modal-close" id="wordClose" aria-label="关闭">×</button><div class="eyebrow">MIAOWU · WORD IN STORY</div><h3>${safe(w)}</h3><div class="pron">${safe(info.phonetic)} · ${safe(info.part)}</div><div class="meaning">${safe(info.meaning)}</div><div class="context">故事原句：<br>${safe(info.context)}</div><div class="word-extra"><strong>额外例句</strong><br>${safe(info.example)}<br><span style="color:var(--muted)">${safe(info.translation)}</span></div><div class="word-extra"><strong>常用搭配</strong><br>${info.collocations.map(x=>safe(x[0])+' · '+safe(x[1])).join('<br>')}</div><div class="word-actions"><button id="wordSpeak">♫ 听发音</button><button id="wordSave">${saved.has(w)?'✓ 已收藏':'♡ 收藏藏书票'}</button></div>`;$('wordPop').classList.add('on');$('wordBackdrop').classList.add('on');$('wordClose').onclick=closeWord;$('wordSpeak').onclick=()=>speakWord(w);$('wordSave').onclick=()=>toggleWord(w)}
    function closeWord(){$('wordPop').classList.remove('on');$('wordBackdrop').classList.remove('on');popWord=null}
    function toggleWord(w){if(saved.has(w)){saved.delete(w);toast('已从藏书票移除，学习记录继续保留')}else{saved.add(w);toast('已收藏到记忆藏书票')}saveWords();if(popWord===w)openWord(w);$('savedCount').textContent=saved.size}
    function saveWords(){try{localStorage.setItem('miaowu_demo_words',JSON.stringify([...saved]));localStorage.setItem('miaowu_demo_mastered',JSON.stringify([...mastered]))}catch(e){}}
    function renderWords(){document.querySelectorAll('[data-word-filter]').forEach(el=>el.classList.toggle('active',el.dataset.wordFilter===wordFilter));const arr=[...saved].filter(w=>wordFilter==='all'||(wordFilter==='mastered'?mastered.has(w):!mastered.has(w)));$('bookplateCount').textContent=saved.size;if(!arr.length){$('vocabGrid').innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="big">♧</div><h3>第一张藏书票，等你来收下</h3><p style="font-size:12px;line-height:1.8">点击小说中的英文词语，收藏后就能看到音标、例句、常用搭配。</p><button class="primary" id="emptyRead">开始阅读 →</button></div>`;$('emptyRead').onclick=()=>openChapter(0);return}$('vocabGrid').innerHTML=arr.map(w=>{const d=WORDS[w],status=mastered.has(w)?'mastered':dueList().includes(w)?'due':'learning';const label=status==='mastered'?'✓ 已掌握':status==='due'?'↻ 待复习':'◷ 学习中';return `<div class="vocab-card status-${status}"><div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span class="eyebrow">MIAOWU · BOOKPLATE</span><span class="word-status">${label}</span></div><h3>${safe(w)}</h3><p class="vocab-phonetic">${safe(d.phonetic)} <button style="border:0;background:transparent;color:var(--wine);cursor:pointer" data-pronounce="${w}" aria-label="播放${w}的发音">♫</button></p><p>${safe(d.part)} ${safe(d.meaning)}</p><div class="vocab-section"><b>故事中的原句</b><div class="vocab-example">${safe(d.context)}</div><small style="color:#987e79">《玫瑰未落幕》 · 演示第${String((WORD_CHAPTER[w]||0)+1).padStart(2,'0')}章</small></div><div class="vocab-section"><b>例句 / EXAMPLE</b><div class="vocab-example">${safe(d.example)}</div><p class="vocab-translation">${safe(d.translation)}</p></div><div class="vocab-section"><b>常用搭配 / COLLOCATIONS</b>${d.collocations.map(pair=>`<div class="vocab-collocation"><span>${safe(pair[0])}</span><span>${safe(pair[1])}</span></div>`).join('')}</div><div class="card-tools"><button data-voice="${w}" aria-label="播放${w}的发音">♫ 发音</button><button data-master="${w}">${mastered.has(w)?'↻ 改为待复习':'✓ 标记已掌握'}</button><button data-remove="${w}">移除收藏</button></div></div>`}).join('');document.querySelectorAll('[data-pronounce]').forEach(el=>el.onclick=()=>speakWord(el.dataset.pronounce));document.querySelectorAll('[data-voice]').forEach(el=>el.onclick=()=>speakWord(el.dataset.voice));document.querySelectorAll('[data-master]').forEach(el=>el.onclick=()=>{let w=el.dataset.master;if(mastered.has(w)){mastered.delete(w);touchWord(w);reviewData[w].nextDue=Date.now()}else mastered.add(w);saveWords();saveReview();renderWords();renderReminder();toast('已更新词汇状态')});document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{toggleWord(el.dataset.remove);renderWords()})}
    function confirmEchoExit(destination='setup'){
      if(echoPhase!=='playing'||quizIndex>=quizQuestions.length){echoPhase='setup';if(destination==='setup')renderQuiz();else navigate(destination);return}
      const done=quizIndex+(quizAnswer!==null?1:0);
      const destText=destination==='setup'?'返回玩法选择':'离开当前练习';
      showModal(`<span class="eyebrow">PAUSE YOUR STORY ECHO</span><h2 id="modalTitle">要结束本轮练习吗？</h2><p>你已经提交 ${done} / ${quizQuestions.length} 道题。已提交的学习记录会保留，当前未提交的题目不计成绩，整轮不标为完成。</p><div class="exit-summary"><strong>已完成 ${done} 道</strong><span>未完成 ${quizQuestions.length-done} 道 · 可随时重新选择玩法</span></div><div class="exit-actions"><button class="secondary-btn" id="echoResume">继续做题</button><button class="primary" id="echoConfirmExit">${destText}</button></div>`);
      $('echoResume').onclick=closeModal;
      $('echoConfirmExit').onclick=()=>{closeModal();echoPhase='setup';quizQuestions=[];quizAnswer=null;quizIndex=0;quizScore=0;quizHint=false;if(destination==='setup')renderQuiz();else navigate(destination)};
    }
    function renderQuiz(){
      const c=$('quizContainer');
      if(echoPhase==='setup'){
        let chapters=echoAvailableChapters();
        const selection=echoScope==='custom'?`<div class="echo-batch-filter"><div class="echo-filter-caption"><strong>按书籍与章节范围快速筛选</strong><small>无需逐章勾选，支持未来多书目</small></div><div class="echo-filter-row"><label>小说<select id="echoBookSelect"><option value="all">全部已读书籍</option>${availablePublishedBooks().map(b=>`<option value="${b.id}" ${echoCustomBook===b.id?'selected':''}>《${safe(b.name)}》</option>`).join('')}</select></label><label>章节范围<select id="echoRangeSelect">${[{id:'all',name:'全部已读章节'},{id:'recent3',name:'最近3章'},{id:'recent10',name:'最近10章'},{id:'range',name:'指定起止章节'}].map(x=>`<option value="${x.id}" ${echoCustomRange===x.id?'selected':''}>${x.name}</option>`).join('')}</select></label></div>${echoCustomRange==='range'?`<div class="echo-range-row"><label>从第 <input type="number" id="echoFrom" min="1" max="${CHAPTERS.length}" value="${echoRangeStart}" aria-label="起始章节"> 章</label><label>至第 <input type="number" id="echoTo" min="1" max="${CHAPTERS.length}" value="${echoRangeEnd}" aria-label="结束章节"> 章</label></div>`:''}<p class="echo-tip">当前可复习 ${echoCustomChapters().length} 个已读演示章节 · 未阅读及未解锁章节不会纳入练习。</p></div>`:'';
        c.innerHTML=`<div class="echo-panel"><span class="eyebrow">DESIGN YOUR MEMORY SESSION</span><h3 class="echo-selector-heading">选一种喜欢的复习方式</h3><p class="echo-tip">可以只练一种，也可以混合两种或三种玩法。每轮约5–8题，中途随时可退出或换玩法。</p><div class="echo-selector-title">01 · 选择练习范围</div><div class="echo-radio-group">${[{id:'chapter',t:'本章复习'},{id:'recent',t:'最近章节'},{id:'custom',t:'自选已读章节'},{id:'due',t:'今日到期词汇'}].map(x=>`<button class="echo-radio ${echoScope===x.id?'selected':''}" data-scope="${x.id}">${x.t}</button>`).join('')}</div>${selection}<div class="echo-selector-title">02 · 选择玩法（至少一项）</div><div class="echo-options">${ECHO_TYPES.map(t=>`<button data-type="${t.id}" class="echo-option ${echoTypes.has(t.id)?'selected':''}" aria-pressed="${echoTypes.has(t.id)}"><span class="echo-option-title">${t.symbol} ${t.title}</span><span class="echo-option-sub">${t.desc}</span><span class="echo-check">${echoTypes.has(t.id)?'✓ 已选择':'○ 点击加入'}</span></button>`).join('')}</div><div class="echo-footer-actions"><span class="echo-tip">${echoTypes.size}种玩法 · 本范围可出 ${quizPool().length} 道演示题</span><button class="primary" id="beginEcho">开始剧情回声 →</button></div></div>`;
        c.querySelectorAll('[data-scope]').forEach(el=>el.onclick=()=>{echoScope=el.dataset.scope;renderQuiz()});
        c.querySelectorAll('[data-type]').forEach(el=>el.onclick=()=>{const id=el.dataset.type;if(echoTypes.has(id)&&echoTypes.size>1)echoTypes.delete(id);else echoTypes.add(id);renderQuiz()});
        if($('echoBookSelect'))$('echoBookSelect').onchange=e=>{echoCustomBook=e.target.value;renderQuiz()};
        if($('echoRangeSelect'))$('echoRangeSelect').onchange=e=>{echoCustomRange=e.target.value;renderQuiz()};
        if($('echoFrom'))$('echoFrom').onchange=e=>{echoRangeStart=Math.max(1,Math.min(CHAPTERS.length,Number(e.target.value)||1));renderQuiz()};
        if($('echoTo'))$('echoTo').onchange=e=>{echoRangeEnd=Math.max(1,Math.min(CHAPTERS.length,Number(e.target.value)||1));renderQuiz()};
        $('beginEcho').onclick=startEcho;
        return;
      }
      if(quizIndex>=quizQuestions.length){
        echoPhase='done';
        c.innerHTML=`<div class="quiz-card" style="text-align:center"><span class="eyebrow">MIAOWU · STORY ECHO</span><div class="stamp" style="margin:17px auto">喵呜<br>✦<br><small>记忆印章</small></div><h3>这次找回了 ${quizScore}/${quizQuestions.length} 道题</h3><p class="echo-tip">有些词只差下一次相遇。答错的目标词已进入后续待复习计划。</p><div class="hero-actions" style="justify-content:center"><button class="primary" id="quizRestart">重新选择玩法</button><button class="secondary-btn" id="quizBack">回到书架</button></div></div>`;
        $('quizRestart').onclick=()=>{echoPhase='setup';renderQuiz()};$('quizBack').onclick=()=>navigate('library');return;
      }
      const q=quizQuestions[quizIndex],answered=quizAnswer!==null,correct=answered&&quizAnswer.trim().toLowerCase()===q.word;
      let answerHTML='';
      if(q.type==='spell'){
        answerHTML=`<div class="spelling-prompt">${safe(q.q)}</div><p class="echo-tip">中文提示：${safe(q.hint)} · ${q.word.length}个英文字母</p><input id="spellingInput" class="answer-input" placeholder="输入英文单词，平板也可使用系统手写输入" spellcheck="false" autocapitalize="none" autocomplete="off" ${answered?'disabled':''} value="${answered?safe(quizAnswer):''}" aria-label="输入拼写答案"><div class="hero-actions" style="gap:10px;margin-top:7px"><button id="spellSubmit" class="primary" ${answered?'disabled':''}>提交拼写</button><button id="spellHint" class="secondary-btn" ${answered?'disabled':''}>${quizHint?'首字母：'+q.word[0]:'提示首字母'}</button></div>`;
      }else{
        answerHTML=`<h3>${safe(q.q)}</h3><div class="answer-grid">${q.choices.map(w=>`<div class="answer-choice ${answered?'answered ':''}${answered?(w===q.word?'correct':w===quizAnswer?'wrong':''):''}"><button class="answer-pick" data-answer="${safe(w)}" ${answered?'disabled':''}>${safe(w)}${answered&&w===q.word?' ✓':''}</button>${answered?`<div class="answer-extra"><span>${safe(WORDS[w].meaning)}</span><button class="answer-speak" data-say="${safe(w)}" aria-label="播放 ${safe(w)} 的发音" title="听 ${safe(w)} 发音">♫</button></div>`:''}</div>`).join('')}</div>`;
      }
      const feedback=answered?`<div class="quiz-response"><strong>${correct?'答对啦！小猫给你盖一枚记忆印章。':'这次还没找回它，看看正确答案。'}</strong><div class="quiz-correct-answer">${safe(q.word)} <span>${safe(WORDS[q.word].phonetic)} · ${safe(WORDS[q.word].meaning)}</span><button type="button" id="quizCorrectSay" class="answer-speak" aria-label="播放正确单词发音">♫</button></div><div class="story-reveal"><strong>故事原句</strong><br>${safe(WORDS[q.word].context)}</div>${q.type==='spell'?`<p class="score-status">${quizHint?'本次使用提示，记录为辅助回忆。':'本次按拼写结果更新词汇复习记录。'}</p>`:''}</div>`:'';
      c.innerHTML=`<div class="quiz-card"><div class="quiz-kicker"><span>STORY ECHO · ${ECHO_TYPES.find(x=>x.id===q.type).title}</span><span>${quizIndex+1} / ${quizQuestions.length}</span></div><div class="quiz-exit-row"><span>当前练习 · 随时可以更换玩法</span><button class="quiet-exit" type="button" id="echoExit">✕ 退出／换玩法</button></div>${answerHTML}${feedback}<div class="quiz-foot"><small>${answered?'已提交答案已保存；可继续或退出。':'根据原剧情回忆；答题后直接显示各选项释义。'}</small><button id="quizNext" class="primary" ${!answered?'disabled':''}>${quizIndex===quizQuestions.length-1?'查看本轮结果':'下一题 →'}</button></div></div>`;
      $('echoExit').onclick=()=>confirmEchoExit('setup');
      c.querySelectorAll('[data-answer]').forEach(el=>el.onclick=()=>reportExamResult(q,el.dataset.answer));
      c.querySelectorAll('[data-say]').forEach(el=>el.onclick=()=>speakWord(el.dataset.say));
      if($('quizCorrectSay'))$('quizCorrectSay').onclick=()=>speakWord(q.word);
      const submit=$('spellSubmit');
      if(submit){const inp=$('spellingInput');submit.onclick=()=>{const ans=inp.value.trim();if(!ans){toast('请输入你回忆出的单词');return}reportExamResult(q,ans,quizHint)};inp.onkeydown=e=>{if(e.key==='Enter'&&!answered)submit.click()};$('spellHint').onclick=()=>{quizHint=true;$('spellHint').textContent='首字母：'+q.word[0]}}
      $('quizNext').onclick=()=>{quizIndex++;quizAnswer=null;quizHint=false;renderQuiz()};
    }

    const apiErrors = {
      INVALID_ACTIVATION:'激活码格式不正确',
      INVALID_ACTIVATION_OR_USERNAME:'激活码无效、已经兑换，或用户名已被占用',
      INVALID_CREDENTIALS:'用户名或密码不正确',
      INVALID_USERNAME_OR_PASSWORD:'用户名或密码不符合要求',
      INVALID_OR_ALREADY_OWNED:'激活码已经兑换，或分类已开通',
      TOO_MANY_ATTEMPTS:'尝试过于频繁，请稍后重试',
      LOGIN_REQUIRED:'登录状态已失效，请重新登录',
      SERVICE_NOT_CONFIGURED:'网站账号服务暂时不可用',
      INVALID_ORIGIN:'安全验证失败，请刷新页面重试',
      INTERNAL_ERROR:'服务暂时出错，请稍后重试'
    };
    async function serverRequest(path, method='GET', payload) {
      const options={method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}};
      if(payload!==undefined){
        options.headers['Content-Type']='application/json';
        options.body=JSON.stringify(payload);
      }
      let response;
      try { response=await fetch(path,options); }
      catch { throw new Error('网络连接失败，请检查网络后重试'); }
      let data;
      try { data=await response.json(); }
      catch { throw new Error('后台响应异常，请稍后重试'); }
      if(!response.ok) throw new Error(apiErrors[data.error] || '请求失败（HTTP '+response.status+'）');
      return data;
    }
    function applyServerAccount(data, move=false) {
      const name=data && data.user && data.user.username;
      user=name?{name}:null;
      grants=new Set(Array.isArray(data && data.categories)?data.categories.map(c=>c.slug):[]);
      renderLibrary();renderAccount();renderReminder();
      $('topAccount').textContent=user?'你好，'+user.name:'登录 / 激活';
      if(move)navigate('account');
    }
    async function loadServerSession(){
      try { applyServerAccount(await serverRequest('/api/auth/me')); }
      catch { applyServerAccount(null); }
    }
    async function submitServerForm(form, task, onSuccess) {
      const btn=form.querySelector('button[type=submit]');
      if(btn){btn.disabled=true;btn.textContent='正在验证…';}
      try{
        const result=await task();
        onSuccess(result);
      }catch(error){
        formError(error.message||'操作失败，请重试');
        if(btn){btn.disabled=false;btn.textContent=btn.dataset.original||'重新提交';}
      }
    }
    function renderAccount(){if(!user){$('accountPanel').innerHTML=`<div class="onboarding" style="margin:0"><span class="eyebrow">YOUR ACCOUNT</span><h3>还没有打开你的私人书房</h3><p>首次购买后，输入自定义账号、自己设置的密码与一次性激活码。以后使用「用户名 + 自设密码」登录。<br><b>测试环境账号已保存至 D1；请勿使用常用密码，正式支付功能尚未开放。</b></p><button class="primary" id="accountRegister">注册并激活测试账号</button><button class="secondary-btn" id="accountLogin" style="margin-left:8px">已有账号？登录</button></div>`;$('accountRegister').onclick=showRegister;$('accountLogin').onclick=showLogin;return}const ent=CATS.filter(c=>has(c.id)),done=VISITED.size,words=touchedWords().length,due=dueList().length;const stats=[{n:done?'1本':'0本',t:'已开始阅读'},{n:done+'章',t:'当前设备已读演示章节'},{n:words+'个',t:'已接触词汇'},{n:mastered.size+'个',t:'标记已掌握'}];$('accountPanel').innerHTML=`<div class="account-box"><div class="account-row"><div class="avatar">${safe(user.name[0].toUpperCase())}</div><div><span class="eyebrow">YOUR PRIVATE SHELF</span><h2 style="font:normal 25px 'Songti SC',serif;color:var(--wine);margin:6px 0">${safe(user.name)} 的书房</h2><span style="font-size:12px;color:var(--muted)">妙屋英语 · 测试环境真实账号（阅读记录仍为本地演示）</span></div></div><div class="account-stats">${stats.map(s=>`<div class="account-stat"><strong>${s.n}</strong><small>${s.t}</small></div>`).join('')}</div><div class="account-reminder"><div><strong>♧ 今日复习</strong><div class="echo-tip">待复习 ${due} 词 · 当前藏书票 ${saved.size} 张 · 已浏览 ${done}/${CHAPTERS.length} 演示章</div></div><button class="primary" id="accountStartReview">${due?'开始复习':'查看剧情回声'} →</button></div><div class="account-content"><div class="account-block"><h3>已解锁学习分类</h3>${ent.map(c=>`<span class="account-tag">✓ ${c.name}</span>`).join('')||'<p>暂无已解锁分类</p>'}<p>此处展示真实 D1 分类权限；现有小说正文仅供功能演示，并非正式付费内容。</p></div><div class="account-block"><h3>兑换新商品</h3><p>使用新的测试激活码为原账号增加分类权限；正式商品尚未销售。</p><button class="primary" id="doRedeem">＋ 兑换新商品</button></div></div><div style="margin-top:20px"><button class="secondary-btn" id="logout">退出账号</button></div></div>`;
      $('accountPanel').querySelector('.account-content').insertAdjacentHTML('afterend',`<div class="account-expanded"><div class="account-feature account-reading-feature"><span class="eyebrow">CURRENTLY READING · 继续阅读</span><h3>《玫瑰未落幕》</h3><p>你已经读到第 ${VISITED.size?Math.max(...VISITED)+1:1} 章 · 演示共 ${CHAPTERS.length} 章</p><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,VISITED.size/CHAPTERS.length*100)}%"></div></div><button id="accountResumeRead" class="secondary-btn">继续阅读 →</button></div><div class="account-feature account-word-feature"><span class="eyebrow">MY MEMORY NOTES · 学习记录</span><h3>你的词汇足迹</h3><div class="account-mini-rows"><span>待复习词汇 <strong>${due}</strong></span><span>已收藏藏书票 <strong>${saved.size}</strong></span><span>学习中词汇 <strong>${Object.keys(reviewData).filter(w=>WORDS[w]&&!mastered.has(w)).length}</strong></span></div></div></div>`);
      $('accountResumeRead').onclick=()=>openChapter(VISITED.size?Math.max(...VISITED):0);
      $('doRedeem').onclick=showRedeem;$('accountStartReview').onclick=()=>{echoScope=due?'due':'recent';echoPhase='setup';navigate('echo')};$('logout').onclick=async()=>{try{await serverRequest('/api/auth/logout','POST',{});applyServerAccount(null,true);toast('已经退出真实测试账号')}catch(e){toast(e.message)}}}
    function showModal(html){$('modalContent').innerHTML=html;$('modalOverlay').classList.add('open');document.body.style.overflow='hidden'}function closeModal(){$('modalOverlay').classList.remove('open');document.body.style.overflow=''}

    function showRegister(opts={}){
      if(user){showRedeem();return;}
      showModal([
        '<span class="eyebrow">OPEN YOUR LIBRARY</span>',
        '<h2 id="modalTitle">注册并激活</h2>',
        '<p>使用全新的测试用户名、密码和未兑换的测试激活码开通分类。账号真实保存在 D1 测试数据库中。</p>',
        '<form id="registerForm">',
          '<div class="form-field"><label for="rName">自定义用户名</label>',
          '<input id="rName" autocomplete="username" minlength="3" maxlength="24" placeholder="3–24位字母、数字或下划线等" required></div>',
          '<div class="form-field"><label for="rPass">测试账号密码</label>',
          '<input id="rPass" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="至少10位，请勿使用常用密码" required></div>',
          '<div class="form-field"><label for="rCode">一次性测试激活码</label>',
          '<input id="rCode" autocomplete="off" placeholder="输入联调页生成的测试码" required></div>',
          '<p class="helper">当前只提供测试账号，不能支付或购买正式小说。若需要测试码，可在账号联调实验室生成。</p>',
          '<div class="form-actions"><button type="submit" class="primary">创建书房并激活 →</button></div>',
          '<div id="formMessage"></div>',
        '</form>',
        '<p class="helper"><a href="/account-test.html">打开账号联调实验室（测试专用）</a></p>',
        '<div style="margin-top:15px"><button class="tiny-action" id="switchLogin">已有账号？去登录</button></div>'
      ].join(''));
      $('switchLogin').onclick=showLogin;
      $('registerForm').onsubmit=e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/auth/register','POST',{
            username:$('rName').value.trim(),password:$('rPass').value,
            activationCode:$('rCode').value.trim()
          }),
          result=>{
            $('rPass').value='';
            closeModal();
            applyServerAccount(result,true);
            toast('测试账号创建成功，分类已开通');
          });
      };
    }
    function showLogin(){
      showModal([
        '<span class="eyebrow">WELCOME BACK</span>',
        '<h2 id="modalTitle">登录我的书房</h2>',
        '<p>使用之前创建的真实测试用户名和密码登录。测试站访问密码 reviewer 与这里的账号不同。</p>',
        '<form id="loginForm">',
          '<div class="form-field"><label for="lName">用户名</label>',
          '<input id="lName" autocomplete="username" placeholder="你注册的测试用户名" required></div>',
          '<div class="form-field"><label for="lPass">登录密码</label>',
          '<input id="lPass" type="password" autocomplete="current-password" placeholder="你设置的测试密码" required></div>',
          '<div class="form-actions"><button class="primary" type="submit">登录书房 →</button></div>',
          '<div id="formMessage"></div>',
        '</form>',
        '<div style="margin-top:16px"><button class="tiny-action" id="switchRegister">还没有账号？去注册激活</button></div>'
      ].join(''));
      $('switchRegister').onclick=()=>showRegister();
      $('loginForm').onsubmit=e=>{
        e.preventDefault();const form=e.currentTarget;
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/auth/login','POST',{
            username:$('lName').value.trim(),password:$('lPass').value
          }),
          result=>{
            $('lPass').value='';
            closeModal();applyServerAccount(result,true);toast('欢迎回到你的书房');
          });
      };
    }
    function showRedeem(){
      if(!user){showLogin();return;}
      showModal([
        '<span class="eyebrow">EXPAND YOUR LIBRARY</span>',
        '<h2 id="modalTitle">兑换新学习分类</h2>',
        '<p>当前账号：',safe(user.name),'。输入另一枚尚未使用的测试码，增加购买分类权限。</p>',
        '<form id="redeemForm"><div class="form-field"><label for="redeemCode">新的测试激活码</label>',
        '<input id="redeemCode" autocomplete="off" placeholder="输入另一枚测试激活码" required></div>',
        '<div class="form-actions"><button class="primary" type="submit">验证并解锁 →</button></div>',
        '<div id="formMessage"></div></form>',
        '<p class="helper">测试码来自 <a href="/account-test.html">账号联调实验室</a>。正式销售及内容授权尚未开放。</p>'
      ].join(''));
      $('redeemForm').onsubmit=e=>{
        e.preventDefault();const form=e.currentTarget;
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/activate','POST',{activationCode:$('redeemCode').value.trim()}),
          result=>{
            closeModal();
            applyServerAccount({user:{username:user.name},categories:result.categories},true);
            toast('测试分类已成功添加');
          });
      };
    }
    function formError(s){$('formMessage').innerHTML=`<div class="form-message">${safe(s)}</div>`}
    function explain(){showModal(`<span class="eyebrow">HOW IT WORKS</span><h2 id="modalTitle">一部小说，一段词汇记忆</h2><p>这是一款将阅读、听书、词汇收藏与情节回忆组合在一起的互动阅读器。</p><div class="onboarding" style="padding:15px;margin:12px 0"><h3>01 · 先读故事</h3><p>第一章开放试读，点击酒红色英文词查义、听发音。</p><h3>02 · 收下藏书票</h3><p>收藏之后，你可以在「记忆藏书票」里复习。</p><h3>03 · 听见剧情回声</h3><p>可选不同玩法、章节范围，通过选择与拼写练习回忆词汇。</p><h3>04 · 解锁完整书架</h3><p>注册测试账号后用真实一次性测试码开通分类，正式购买功能仍未上线。</p></div><button class="primary" id="explainRead" style="width:100%">开始试读 →</button>`);$('explainRead').onclick=()=>{closeModal();openChapter(0)}}
    function speakWord(w){if(!('speechSynthesis' in window)){toast('此浏览器暂不支持语音朗读');return}window.speechSynthesis.cancel();speaking=false;$('player').classList.remove('show');let u=new SpeechSynthesisUtterance(w);u.lang='en-US';u.rate=.82;window.speechSynthesis.speak(u)}
    function stopReading(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speaking=false;paused=false;utterances=[];$('player').classList.remove('show')}
    function startReading(){if(!('speechSynthesis' in window)){toast('此浏览器暂不支持朗读');return}stopReading();let lines=CHAPTERS[chapter].parts,segments=[];for(const text of lines){let pieces=text.split(/(\[\[[a-z]+\]\]（[^）]+）)/g).filter(Boolean);for(let piece of pieces){let m=piece.match(/^\[\[([a-z]+)\]\]（[^）]+）$/);segments.push({text:m?m[1]:piece,lang:m?'en-US':'zh-CN'})}}utterances=segments;speakIndex=0;speaking=true;paused=false;$('player').classList.add('show');$('playerState').textContent='中文 / 英语分段合成朗读';$('playerPause').textContent='Ⅱ';speakNext()}
    function speakNext(){if(!speaking)return;if(speakIndex>=utterances.length){stopReading();toast('演示朗读结束');return}const seg=utterances[speakIndex++],u=new SpeechSynthesisUtterance(seg.text);u.lang=seg.lang;u.rate=seg.lang==='en-US'?.86:.94;u.onend=()=>{if(speaking)speakNext()};u.onerror=(e)=>{if(speaking&&e.error!=='interrupted')speakNext()};window.speechSynthesis.speak(u)}
    document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>navigate(el.dataset.nav));$('goHome').onclick=e=>{e.preventDefault();navigate('library')};$('heroRead').onclick=()=>openChapter(0);$('heroExplain').onclick=explain;$('readerBack').onclick=()=>navigate('library');$('openActivation').onclick=()=>user?showRedeem():showRegister();$('topAccount').onclick=()=>user?navigate('account'):showLogin();$('wordbookRead').onclick=()=>openChapter(0);$('doEcho').onclick=()=>{echoScope='chapter';echoPhase='setup';echoChapterSet=new Set([chapter]);navigate('echo')};$('smallerFont').onclick=()=>{fontSize=Math.max(15,fontSize-1);$('storyText').style.fontSize=fontSize+'px'};$('biggerFont').onclick=()=>{fontSize=Math.min(25,fontSize+1);$('storyText').style.fontSize=fontSize+'px'};function changeGloss(){gloss=!gloss;$('storyText').classList.toggle('no-gloss',!gloss);$('toggleGloss').classList.toggle('pressed',!gloss);toast(gloss?'已显示释义':'已隐藏释义，可以尝试回忆')}$('toggleGloss').onclick=changeGloss;$('sideToggleGloss').onclick=changeGloss;$('toggleNight').onclick=flipTheme;$('globalThemeToggle').onclick=flipTheme;$('sideRead').onclick=startReading;$('topRead').onclick=startReading;$('playerPause').onclick=()=>{if(!speaking)return;if(paused){window.speechSynthesis.resume();paused=false;$('playerPause').textContent='Ⅱ';$('playerState').textContent='继续朗读'}else{window.speechSynthesis.pause();paused=true;$('playerPause').textContent='▶';$('playerState').textContent='已暂停'}};$('playerStop').onclick=stopReading;$('wordBackdrop').onclick=closeWord;$('modalClose').onclick=closeModal;$('modalOverlay').onclick=e=>{if(e.target===$('modalOverlay'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeWord()}});document.querySelectorAll('[data-word-filter]').forEach(el=>el.onclick=()=>{wordFilter=el.dataset.wordFilter;renderWords()});
    applyTheme();renderLibrary();renderReminder();renderWords();renderQuiz();renderAccount();loadServerSession();
  })();
  