
  (()=>{
    'use strict';
    // Original approved design; D1 now powers the primary book, reader, saved words and progress views.
    let CATS=[{id:'cet4',en:'CET-4',name:'大学英语四级',sub:'核心词 · 故事精选',icon:'✦',available:true},{id:'cet6',en:'CET-6',name:'大学英语六级',sub:'更进一步 · 待推出',icon:'✧',available:false},{id:'postgrad',en:'POSTGRAD',name:'考研英语',sub:'学术与表达 · 待推出',icon:'❦',available:false},{id:'ielts',en:'IELTS',name:'雅思英语',sub:'世界阅读 · 待推出',icon:'✳',available:false}];
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
    function renderReminder(){
      const area=$('reviewReminder');
      if(!area)return;
      const due=user?cloudDue():0,seen=cloudSaved.size;
      const title=!user?(saved.size?'喵呜，你在本机演示收藏了 '+saved.size+' 张词卡':'喵呜，欢迎来到你的故事书房'):
        due?'喵呜，今天有 '+due+' 个单词等你复习':
        seen?'喵呜，你已收藏 '+seen+' 张云端词卡':saved.size?'喵呜，你在本机演示收藏了 '+saved.size+' 张词卡':'喵呜，读一段故事，收藏第一张词卡';
      const hint=!user?(saved.size?'演示收藏仅保存在当前浏览器；登录后正式小说收藏可跨设备同步。':'登录后，正式小说的章节进度与词卡可以跨设备保存。'):
        due?'这些词已经到复习时间。进入剧情回声，完成练习后会更新云端学习记录。':
        saved.size&&!seen?'演示收藏保存在当前浏览器，可在记忆藏书票查看；正式小说词卡会同步到账号。':'进入记忆藏书票复习已收藏的单词，也可以到剧情回声回顾已读章节。';
      area.innerHTML='<div class="reminder-cat" aria-hidden="true">'+
        '<svg viewBox="0 0 48 48" width="30" height="30" fill="currentColor">'+
        '<ellipse cx="12" cy="15" rx="4.1" ry="5.6" transform="rotate(-24 12 15)"/>'+
        '<ellipse cx="23" cy="10" rx="4.1" ry="5.6"/>'+
        '<ellipse cx="34" cy="15" rx="4.1" ry="5.6" transform="rotate(24 34 15)"/>'+
        '<ellipse cx="41" cy="25" rx="3.4" ry="4.6" transform="rotate(30 41 25)"/>'+
        '<path d="M23 23c-6.2 0-9.6 5-13 9.4-2.2 3-1 8.6 3.7 9.1 3.9.5 6.2-2.2 9.3-2.2 3.2 0 5.5 2.7 9.4 2.2 4.7-.5 5.9-6.1 3.7-9.1C32.6 28 29.2 23 23 23Z"/></svg></div>'+
        '<div class="reminder-content"><strong>'+safe(title)+'</strong><small>'+safe(hint)+'</small></div>'+
        '<button class="primary reminder-btn" id="reviewReminderBtn">'+
        (user||saved.size?'查看记忆藏书票 →':'登录后同步 →')+'</button>';
      $('reviewReminderBtn').onclick=()=>user||saved.size?navigate('words'):showLogin();
    }
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
    let echoMode='demo',echoScope='recent',echoTypes=new Set(['fill','situation','spell']),echoPhase='setup',echoChapterSet=new Set([0]),quizQuestions=[],quizHint=false;
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

    function navigate(to){if(view==='echo'&&echoMode==='cloud'&&window.MiaowuCloudEcho?.running()){window.MiaowuCloudEcho.leave(to);return}if(view==='echo'&&echoMode==='demo'&&echoPhase==='playing'&&quizIndex<quizQuestions.length&&to!=='echo'){confirmEchoExit(to);return}if(view==='reader'&&to!=='reader')stopReading();view=to;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+to));document.querySelectorAll('[data-nav]').forEach(el=>{el.classList.toggle('on',el.dataset.nav===to);el.classList.toggle('active',el.dataset.nav===to)});window.scrollTo({top:0,behavior:'instant'});if(to==='library'){renderLibrary();renderReminder();}if(to==='words')renderWords();if(to==='echo')renderQuiz();if(to==='account')renderAccount();$('topAccount').textContent=user?('你好，'+user.name):'登录 / 激活'}

    // D1 is the primary reader source. Legacy chapter sample stays unreachable from default book cards.
    // No paid chapter bodies are bundled into app.js or held in a client-side book constant.
    let cloudListSequence=0;
    let activeCloud=null;
    let cloudBooks=[],cloudSaved=new Map(),cloudProgress=[],cloudSessionKey=null,cloudLearningSequence=0;
    let cloudReviewDue=0;
    const cloudDue=()=>cloudReviewDue;
    async function refreshCloudLearning(){
      const requested=user?.name||null,seq=++cloudLearningSequence;
      if(!requested){cloudSaved=new Map();cloudProgress=[];cloudReviewDue=0;return}
      try{
        const [words,progress,stats]=await Promise.all([
          serverRequest('/api/me/words'),serverRequest('/api/me/progress'),
          serverRequest('/api/me/echo/stats')
        ]);
        if(seq!==cloudLearningSequence||user?.name!==requested)return;
        cloudSaved=new Map((words.words||[]).map(w=>[w.word_id,w]));
        cloudReviewDue=Number(stats.due)||0;
        cloudProgress=progress.progress||[];
        if(view==='library')updateCloudShelfProgress();
        renderReminder();
        if(view==='account')renderAccount();
        if(view==='words')renderWords();
        if(view==='echo'&&echoMode==='cloud'&&!window.MiaowuCloudEcho?.running())renderQuiz();
        if(activeCloud?.chapterId)showCloudProgress(activeCloud.chapterId);
      }catch(error){if(seq===cloudLearningSequence)toast('云端学习记录暂未加载：'+error.message)}
    }
    async function refreshCloudCategories(){
      try{
        const d=await serverRequest('/api/categories');
        if(!Array.isArray(d.categories)||!d.categories.length)return;
        const info=new Map(CATS.map(c=>[c.id,c]));
        CATS=d.categories.map(c=>{
          const old=info.get(c.slug)||{};
          return {id:c.slug,en:old.en||String(c.slug).toUpperCase(),name:c.title,
            sub:old.sub||'云端内容书架',icon:old.icon||'✦',available:true};
        });
        if(!CATS.some(c=>c.id===category))category=CATS[0].id;
        if(view==='library')renderLibrary();
      }catch{ /* Existing category labels are a harmless offline fallback. */ }
    }
    function openFirstCloudBook(){
      const book=cloudBooks[0];
      if(book)openCloudBook(book,category);
      else{navigate('library');toast('当前分类暂无已发布故事，请稍后再来')}
    }
    function updateCloudShelfProgress(){
      document.querySelectorAll('[data-live-progress]').forEach(node=>{
        const id=node.dataset.liveProgress;
        const book=cloudBooks.find(b=>b.id===id);
        if(!book)return;
        const completed=cloudProgress.filter(p=>p.book_id===id&&p.completed_at).length;
        const started=cloudProgress.some(p=>p.book_id===id);
        const total=Math.max(0,Number(book.chapter_count)||0);
        const info=node.querySelector('.progress-text span:first-child');
        const ratio=node.querySelector('.progress-text span:last-child');
        const line=node.querySelector('.progress-fill');
        if(info)info.textContent=!user?'登录后可保存阅读进度':
          started?'已读完 '+completed+' 章 · 云端已同步':'尚未开始阅读';
        if(ratio)ratio.textContent=total?completed+' / '+total+' 章':'尚无已发布章节';
        if(line)line.style.width=(total?Math.min(100,Math.round(completed/total*100)):0)+'%';
      });
    }
    async function loadCloudBookCards(slug){
      const seq=++cloudListSequence;
      const list=$('bookGrid');
      list.innerHTML='<div class="onboarding cloud-loading" style="grid-column:1/-1"><span class="eyebrow">YOUR STORY SHELF</span><h3>正在整理故事书架……</h3><p>为你翻开已经发布的故事。</p></div>';
      try{
        const response=await serverRequest('/api/books?category='+encodeURIComponent(slug));
        if(seq!==cloudListSequence||category!==slug||view!=='library')return;
        const books=Array.isArray(response.books)?
          response.books.filter(b=>b&&typeof b.id==='string'&&typeof b.title==='string'):[];
        cloudBooks=books;
        list.replaceChildren();
        books.forEach((book,i)=>{
          const item=document.createElement('div');
          item.className='book-item cloud-book-item';
          const kind=['one','two','three'][i%3];
          const test=/测试|示例|qa-|demo|sample/i.test(book.title+' '+book.id);
          const coverTitle=test?'故事试读册':book.title;
          const coverLabel=test?'TEST EDITION · 功能测试':'STORY COLLECTION';
          const badge=test?'测试内容 · 不出售':has(slug)?'已解锁':'免费试读';
          const action=cloudProgress.some(p=>p.book_id===book.id)?'继续阅读 →':'开始试读 →';
          item.innerHTML='<div class="book-cover '+kind+'" aria-label="'+safe(book.title)+'">'+
            '<span class="book-tag">'+safe(badge)+'</span>'+
            '<span class="edition">THE STORY EDITION / '+String(i+1).padStart(2,'0')+'</span>'+
            '<span class="illustration">'+['❦','♧','✥'][i%3]+'</span>'+
            '<h3>'+safe(coverTitle)+'</h3><span class="edition-bottom">'+safe(coverLabel)+'</span></div>'+
            '<div class="book-info"><div class="line1"><h3 title="'+safe(book.title)+'">'+safe(book.title)+'</h3>'+
            '<span class="eyebrow">'+String(i+1).padStart(2,'0')+'</span></div>'+
            '<p>'+safe(book.description||'读一本舍不得合上的故事。')+'</p>'+
            '<div class="book-meta"><span class="pill">'+safe(slug.toUpperCase())+'</span>'+
            '<span class="pill">'+(test?'仅供联调':has(slug)?'已拥有学习权限':'免费章节开放')+'</span></div>'+
            '<div class="shelf-progress" data-live-progress="'+safe(book.id)+'">'+
            '<div class="progress-text"><span>正在读取阅读记录</span><span>—</span></div>'+
            '<div class="progress-track"><div class="progress-fill" style="width:0%"></div></div></div>'+
            '<div class="book-actions"><button class="primary" type="button">'+action+'</button></div></div>';
          item.querySelector('.book-actions button').onclick=()=>openCloudBook(book,slug);
          list.append(item);
        });
        // Preserve the user's approved original two-chapter local demo as a
        // clearly labelled teaching/interaction sample. D1 is still the ONLY
        // source for published and paid books. Never double-render a D1 book.
        const showRoseDemo=slug==='cet4'&&!books.some(b=>
          b.id==='rose'||b.title==='玫瑰未落幕');
        if(showRoseDemo){
          const rose=BOOKS.find(b=>b.id==='rose'&&b.status==='demo');
          if(rose){
            const item=document.createElement('div');
            item.className='book-item demo-book-item';
            const ix=books.length+1;
            item.innerHTML='<div class="book-cover '+safe(rose.kind)+'" aria-label="'+safe(rose.name)+' 互动演示">'+
              '<span class="book-tag">互动演示 · 非正式商品</span>'+
              '<span class="edition">THE STORY EDITION / '+String(ix).padStart(2,'0')+'</span>'+
              '<span class="illustration">'+safe(rose.illustration)+'</span>'+
              '<h3>'+safe(rose.name)+'</h3><span class="edition-bottom">DEMO · 2 CHAPTERS</span></div>'+
              '<div class="book-info"><div class="line1"><h3>'+safe(rose.name)+'</h3>'+
              '<span class="eyebrow">'+String(ix).padStart(2,'0')+'</span></div>'+
              '<p>保留的两章互动测试故事；点击英文词可体验词卡与发音。演示进度保存在本浏览器，不代表正式购买权益。</p>'+
              '<div class="book-meta"><span class="pill">CET4 演示</span>'+
              '<span class="pill">仅供体验 · 不出售</span></div>'+
              '<div class="shelf-progress"><div class="progress-text">'+
              '<span>共2章 · 浏览器本地演示</span><span>—</span></div></div>'+
              '<div class="book-actions"><button class="secondary-btn" type="button">试读演示第1章 →</button></div></div>';
            item.querySelector('.book-actions button').onclick=()=>openChapter(0);
            list.append(item);
          }
        }
        // Keep the approved V0.3 three-cover rhythm when room remains.
        // Placeholder covers have no published body or downloadable content.
        const visibleCardCount=books.length+(showRoseDemo?1:0);
        if(slug==='cet4'&&visibleCardCount<3){
          BOOKS.filter(b=>b.status==='planned').slice(0,3-visibleCardCount).forEach((b,i)=>{
            const item=document.createElement('div');
            item.className='book-item planned-book-item';
            const ix=visibleCardCount+i+1;
            item.innerHTML='<div class="book-cover '+safe(b.kind)+'">'+
              '<span class="book-tag">内容筹备中</span>'+
              '<span class="edition">THE STORY EDITION / '+String(ix).padStart(2,'0')+'</span>'+
              '<span class="illustration">'+safe(b.illustration)+'</span>'+
              '<h3>'+safe(b.name)+'</h3><span class="edition-bottom">COMING SOON · 故事企划</span></div>'+
              '<div class="book-info"><div class="line1"><h3>'+safe(b.name)+'</h3>'+
              '<span class="eyebrow">'+String(ix).padStart(2,'0')+'</span></div>'+
              '<p>'+safe(b.desc)+'</p><div class="book-meta">'+
              '<span class="pill">'+safe(b.tag)+'</span><span class="pill">未上架 · 不可购买</span></div>'+
              '<div class="shelf-progress"><div class="progress-text"><span>故事企划阶段</span>'+
              '<span>敬请期待</span></div></div>'+
              '<div class="book-actions"><button class="secondary-btn" type="button" disabled>尚未开放</button></div></div>';
            list.append(item);
          });
        }
        if(!books.length){
          const explanation=document.createElement('div');
          explanation.className='onboarding cloud-shelf-empty';
          explanation.innerHTML='<span class="eyebrow">YOUR NEXT STORY</span>'+
            '<h3>这一层书架，还在等待故事</h3>'+
            '<p>'+(showRoseDemo?
              '目前没有正式发布的数据库小说。《玫瑰未落幕》仅保留两章临时互动演示，不是付费商品；其余封面为未上架企划。':
              '目前没有已发布的小说。下方封面为尚未上架的设计企划，不能阅读或购买。')+'</p>';
          list.prepend(explanation);
        }
        updateCloudShelfProgress();
      }catch(error){
        if(seq===cloudListSequence&&category===slug&&view==='library'){
          list.innerHTML='<div class="onboarding" style="grid-column:1/-1">'+
            '<h3>书架暂时没有连接成功</h3><p>'+safe(error.message)+'</p>'+
            '<button class="secondary-btn" id="retryCloudBooks">重试加载</button></div>';
          $('retryCloudBooks').onclick=()=>loadCloudBookCards(slug);
        }
      }
    }
    async function openCloudBook(book,slug){
      try{
        const catalog=await serverRequest('/api/books/'+encodeURIComponent(book.id)+'/chapters');
        const chapters=Array.isArray(catalog.chapters)?catalog.chapters:[];
        if(!chapters.length){toast('这本书尚无已发布章节');return;}
        activeCloud={bookId:book.id,title:book.title,slug,chapters,chapterId:null,parts:[]};
        showModal(`<span class="eyebrow">MIAOWU · STORY CHAPTERS</span><h2 id="modalTitle">${safe(book.title)}</h2>
          <p>目录可见。免费试读公开，完整正文由服务器核对账号所属分类的权限后返回。</p>
          <div class="cloud-chapter-options">${chapters.map(ch=>`<button class="chapter-btn" type="button" data-cloud-choose="${safe(ch.id)}">${String(ch.chapterNo).padStart(2,'0')} · ${safe(ch.title)} ${ch.isPreview?'· 免费试读':(ch.canRead?'· 已授权':'· 🔒 未解锁')}</button>`).join('')}</div>`);
        document.querySelectorAll('[data-cloud-choose]').forEach(btn=>{
          btn.onclick=()=>openCloudChapter(btn.dataset.cloudChoose);
        });
      }catch(error){toast(error.message||'章节目录加载失败');}
    }
    function renderD1Paragraph(paragraph){
      if(typeof paragraph==='string')return '<p>'+safe(paragraph)+'</p>';
      const segments=Array.isArray(paragraph?.segments)?paragraph.segments:[];
      const html=segments.map(segment=>{
        if(typeof segment?.text==='string')return safe(segment.text);
        if(typeof segment?.wordId==='string' && typeof segment.surface==='string'){
          return '<button class="word cloud-word" data-cloud-word="'+safe(segment.wordId)+'">'+
            safe(segment.surface)+'</button><span class="gloss">（'+safe(segment.gloss||'')+'）</span>';
        }
        return '';
      }).join('');
      return '<p>'+html+'</p>';
    }
    function cloudPlainText(paragraph){
      if(typeof paragraph==='string')return paragraph;
      return (Array.isArray(paragraph?.segments)?paragraph.segments:[])
        .map(s=>typeof s?.text==='string'?s.text:(s?.surface||'')).join('');
    }
    function showCloudWord(wordId){
      if(!activeCloud?.words?.has(wordId)){toast('暂时未找到这张词卡');return}
      const w=activeCloud.words.get(wordId);
      const current=cloudSaved.get(wordId);
      const pairs=Array.isArray(w.collocations)?w.collocations:[];
      $('wordPop').innerHTML='<button class="modal-close" id="wordClose" aria-label="关闭">×</button>'+
        '<div class="eyebrow">MIAOWU · WORD IN STORY</div><h3>'+safe(w.headword)+'</h3>'+
        '<div class="pron">'+safe(w.phonetic_us||w.phonetic_uk||'')+
        ' <button id="wordSmallSpeak" class="word-voice-inline" aria-label="播放发音">♫</button> · '+safe(w.part_of_speech||'')+'</div>'+
        '<div class="meaning">'+safe(w.meaning_zh||'')+'</div>'+
        '<div class="context">故事原句：<br>'+safe(w.context_sentence||'')+'</div>'+
        '<div class="word-extra"><strong>额外例句</strong><br>'+safe(w.example_en||'')+
        '<br><span style="color:var(--muted)">'+safe(w.example_zh||'')+'</span></div>'+
        '<div class="word-extra"><strong>常用搭配</strong><br>'+pairs.map(x=>safe(x.en||'')+' · '+safe(x.zh||'')).join('<br>')+'</div>'+
        '<div class="word-actions"><button id="wordSpeak">♫ 听发音</button>'+
        '<button id="wordSave">'+(current?'✓ 已收藏 · 移除':'♡ 收藏藏书票')+'</button>'+
        '<button id="cloudMaster">'+(current?.status==='mastered'?'↻ 继续学习':'✓ 标记已掌握')+'</button></div>';
      $('wordPop').classList.add('on');$('wordBackdrop').classList.add('on');
      $('wordClose').onclick=closeWord;
      $('wordSpeak').onclick=()=>speakWord(w.headword);
      $('wordSmallSpeak').onclick=()=>speakWord(w.headword);
      $('wordSave').onclick=()=>saveCloudWord(wordId,false);
      $('cloudMaster').onclick=()=>saveCloudWord(wordId,true);
    }
    async function saveCloudWord(id,markMastered){
      if(!user){closeWord();showLogin();return}
      const w=activeCloud?.words?.get(id);
      if(!w)return;
      const old=cloudSaved.get(id);
      const bookmarked=markMastered?true:!old;
      const status=markMastered?(old?.status==='mastered'?'learning':'mastered'):(old?.status||'learning');
      const action=$('wordSave');if(action)action.disabled=true;
      try{
        await serverRequest('/api/me/words/'+encodeURIComponent(id),'PUT',{bookmarked,status});
        if(bookmarked)cloudSaved.set(id,{...w,word_id:id,status,bookmarked:1});
        else cloudSaved.delete(id);
        toast(bookmarked?'已同步到云端记忆藏书票':'已从云端藏书票移除');
        showCloudWord(id);
        refreshCloudLearning();
      }catch(error){toast(error.message);if(action)action.disabled=false}
    }
    function showCloudProgress(chapterId){
      if(!activeCloud)return;
      const savedProgress=cloudProgress.find(p=>p.chapter_id===chapterId);
      const finished=activeCloud.chapters.filter(ch=>cloudProgress.some(p=>p.chapter_id===ch.id&&p.completed_at)).length;
      $('readingStatus').textContent=!user?'免费阅读 · 登录可存进度':
        savedProgress?.completed_at?'✓ 已读完 · 云端同步':savedProgress?'阅读中 · 云端同步':'尚未记录本章进度';
      $('progressBar').style.width=Math.round(finished/Math.max(1,activeCloud.chapters.length)*100)+'%';
      $('savedCount').textContent=cloudSaved.size;
      $('readerUnseen').textContent=String(Array.from(activeCloud.words?.keys()||[]).filter(id=>!cloudSaved.has(id)).length);
      $('readerDue').textContent=String(cloudDue());
      const finish=$('cloudFinishReading');
      if(finish){finish.hidden=false;finish.disabled=!user;finish.textContent=savedProgress?.completed_at?'✓ 本章已读完（已同步）':'✓ 标记本章读完并同步';}
    }
    async function finishCloudChapter(){
      if(!activeCloud?.chapterId)return;
      if(!user){showLogin();return}
      const id=activeCloud.chapterId,button=$('cloudFinishReading');
      button.disabled=true;
      try{
        await serverRequest('/api/me/progress','POST',{chapterId:id,progress:1});
        await refreshCloudLearning();
        showCloudProgress(id);toast('阅读进度已保存到你的云端账号');
      }catch(error){toast(error.message);button.disabled=false}
    }
    let cloudChapterSequence=0;
    async function openCloudChapter(id){
      if(!activeCloud)return;
      const book=activeCloud;
      // A chapter-list click must visibly respond before any network request.
      const selected=book.chapters.find(ch=>ch.id===id);
      if(!selected)return;
      const chosen=++cloudChapterSequence;
      closeModal();
      navigate('reader');
      $('chapterNo').textContent='CHAPTER '+String(selected.chapterNo).padStart(2,'0');
      $('chapterTitle').textContent=selected.title;
      $('readerCrumb').textContent=(book.slug||'STORY').toUpperCase()+' / '+book.title;
      $('storyText').innerHTML='<p class="cloud-reader-loading" role="status">正在打开章节，读取云端正文……</p>';
      $('cloudFinishReading').hidden=true;
      $('nextChapter').disabled=true;
      $('doEcho').disabled=true;
      book.chapterId=null;
      window.MiaowuChapterWords?.openChapter(id);
      // Always fetch D1, even for previously visited chapters. Never trust
      // local entitlement flags when deciding access to protected text.
      let page;
      try{page=await serverRequest('/api/chapters/'+encodeURIComponent(id));}
      catch(error){
        if(activeCloud!==book||chosen!==cloudChapterSequence||view!=='reader')return;
        const needsLogin=error.code==='LOGIN_REQUIRED';
        const needsUnlock=error.code==='PURCHASE_REQUIRED';
        const reason=needsLogin?'登录后才能阅读这章的付费内容。':
          needsUnlock?'这章还没有对应分类的阅读权限。付费正文不会返回到浏览器。':
          '云端章节暂时没有加载成功：'+(error.message||'未知错误');
        $('storyText').replaceChildren();
        const panel=document.createElement('div');panel.className='onboarding cloud-reader-error';
        const title=document.createElement('h3');title.textContent='这一章暂时无法打开';
        const description=document.createElement('p');description.textContent=reason;
        const retry=document.createElement('button');retry.className='primary';retry.type='button';
        retry.textContent=needsLogin?'登录账号':needsUnlock?'解锁分类':'重试打开本章';
        retry.onclick=needsLogin?showLogin:needsUnlock?()=>user?showRedeem():showLogin():()=>openCloudChapter(id);
        panel.append(title,description,retry);$('storyText').append(panel);
        $('readingStatus').textContent='加载未成功';
        return;
      }
      if(activeCloud!==book||chosen!==cloudChapterSequence||view!=='reader')return;
      const rawParts=Array.isArray(page.content?.paragraphs)?page.content.paragraphs:[];
      const parts=rawParts.filter(x=>typeof x==='string' || (x && Array.isArray(x.segments))).slice(0,300);
      book.chapterId=id;book.parts=parts.map(cloudPlainText);book.rawParagraphs=parts;
      book.words=new Map();
      // The paid/free chapter is displayed first. Optional vocabulary loads
      // after rendering and is never allowed to keep the dialog open.
      const thisChapter=book.chapters.find(ch=>ch.id===id);
      const ix=book.chapters.findIndex(ch=>ch.id===id);
      const next=book.chapters[ix+1];
      $('chapterNo').textContent='CHAPTER '+String(page.chapterNo).padStart(2,'0')+(thisChapter?.isPreview?' · FREE PREVIEW':' · PRIVATE READING');
      $('chapterTitle').textContent=page.title;
      $('storyText').innerHTML=parts.map(renderD1Paragraph).join('')||'<p>此测试章节暂无段落。</p>';
      $('storyText').querySelectorAll('[data-cloud-word]').forEach(btn=>btn.onclick=()=>showCloudWord(btn.dataset.cloudWord));
      $('storyText').style.fontSize=fontSize+'px';
      $('readerCrumb').textContent=book.slug.toUpperCase()+' / '+book.title;
      const sideHeading=$('chapterList').parentElement.querySelector('h3');
      if(sideHeading)sideHeading.textContent=book.title+' · 目录';
      const sideCaption=$('chapterList').parentElement.querySelector('.side-caption');
      if(sideCaption)sideCaption.textContent='只显示已发布章节，未授权正文不会传到浏览器。';
      $('chapterList').innerHTML=book.chapters.map(ch=>`<button class="chapter-btn ${ch.id===id?'current':''}" data-cloud-chapter="${safe(ch.id)}" type="button">${String(ch.chapterNo).padStart(2,'0')} · ${safe(ch.title)} ${ch.isPreview?'· 免费':' · '+(ch.canRead?'已授权':'🔒')}</button>`).join('');
      $('chapterList').querySelectorAll('[data-cloud-chapter]').forEach(btn=>btn.onclick=()=>openCloudChapter(btn.dataset.cloudChapter));
      $('readingChapter').textContent='第'+page.chapterNo+'章';
      showCloudProgress(id);
      $('storyText').classList.toggle('no-gloss',!gloss);
      $('toggleGloss').disabled=false;
      $('sideToggleGloss').disabled=false;
      $('doEcho').disabled=false;
      $('doEcho').title='练习本章已读单词并同步云端复习记录';
      $('nextChapter').textContent=next?'下一章 →':'返回书架 →';
      $('nextChapter').disabled=false;
      $('nextChapter').onclick=()=>next?openCloudChapter(next.id):navigate('library');
      const study=$('readerLayout').querySelector('#readerLearningStats');
      if(study)study.hidden=true;
      const note=$('readerLayout').querySelector('.sidebar .side-panel:nth-child(2) .side-caption');
      if(note)note.textContent='点击正文英文标注查看词卡；阅读进度与收藏保存在云端。';
      try{
        const glossary=await serverRequest('/api/chapters/'+encodeURIComponent(id)+'/words');
        if(activeCloud!==book||chosen!==cloudChapterSequence||book.chapterId!==id)return;
        for(const row of (glossary.words||[])){
          if(row?.word_id&&!book.words.has(row.word_id))book.words.set(row.word_id,row);
        }
        window.MiaowuChapterWords?.setWords([...book.words.values()]);
        showCloudProgress(id);
      }catch{
        if(activeCloud===book&&chosen===cloudChapterSequence&&book.chapterId===id){
          toast('正文已打开，但词汇详情暂未加载；稍后切换章节可重试');
        }
      }
    }
    function resetDemoReadingUI(){
      activeCloud=null;
      $('cloudFinishReading').hidden=true;
      const heading=$('chapterList').parentElement.querySelector('h3');
      if(heading)heading.textContent='《玫瑰未落幕》 · 目录';
      const caption=$('chapterList').parentElement.querySelector('.side-caption');
      if(caption)caption.textContent='仅有2章临时测试内容。正式版本计划每部25–35章。';
      $('toggleGloss').disabled=false;
      $('sideToggleGloss').disabled=false;
      $('doEcho').disabled=false;$('doEcho').title='';
      const study=$('readerLayout').querySelector('#readerLearningStats');
      if(study)study.hidden=false;
      const note=$('readerLayout').querySelector('.sidebar .side-panel:nth-child(2) .side-caption');
      if(note)note.textContent='点击正文中的酒红色英文词汇，打开释义、发音与收藏。';
    }

    function renderLibrary(){
      const cat=$('categories');
      cat.innerHTML=CATS.map(c=>'<button class="category '+(c.id===category?'selected':'')+
        ' available" data-category="'+safe(c.id)+'"><span class="category-en">'+safe(c.en)+
        '</span><span class="category-icon">'+safe(c.icon)+'</span><strong>'+safe(c.name)+
        '</strong><small>'+safe(c.sub)+'</small><span class="category-tag">'+
        (has(c.id)?'✓ 已解锁':'● 可查看书架')+'</span></button>').join('');
      cat.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{
        category=el.dataset.category;cloudBooks=[];renderLibrary();
      });
      const picked=CATS.find(x=>x.id===category)||CATS[0];
      $('selectedCategoryEn').textContent=picked.en+' · STORY COLLECTION';
      $('selectedCategoryTitle').textContent=picked.name+' · 故事书架';
      loadCloudBookCards(category);
    }
    function splitPart(txt){const rg=/\[\[([a-z]+)\]\]（([^）]+)）/g;let last=0,html='',m;while((m=rg.exec(txt))){html+=safe(txt.slice(last,m.index));html+=`<button class="word" data-word="${m[1]}">${m[1]}</button><span class="gloss">（${safe(m[2])}）</span>`;last=rg.lastIndex}return html+safe(txt.slice(last))}
    function openChapter(num){resetDemoReadingUI();if(num>0&&!has('cet4')){showRegister({intent:'locked'});return}if(num<0||num>=CHAPTERS.length)return;chapter=num;VISITED.add(num);CHAPTER_WORDS[num].forEach(touchWord);saveReview();navigate('reader');$('chapterNo').textContent=`CHAPTER ${String(num+1).padStart(2,'0')} · ${num===0?'FREE PREVIEW':'MEMBER PREVIEW'}`;$('chapterTitle').textContent=CHAPTERS[num].title;$('storyText').innerHTML=CHAPTERS[num].parts.map(p=>`<p>${splitPart(p)}</p>`).join('');$('storyText').style.fontSize=fontSize+'px';$('readerCrumb').textContent='四级故事馆 / '+(num===0?'免费试读':'已购演示');$('chapterList').innerHTML=CHAPTERS.map((ch,i)=>`<button class="chapter-btn ${i===num?'current':''}" data-chapter="${i}">${String(i+1).padStart(2,'0')} · ${ch.title} ${i===1&&!has('cet4')?'🔒':''}</button>`).join('')+'<button class="chapter-btn" disabled>03–30 · 内容筹备中</button>';document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>openChapter(Number(b.dataset.chapter)));document.querySelectorAll('.word').forEach(b=>b.onclick=()=>openWord(b.dataset.word));$('readingStatus').textContent=has('cet4')?'四级已解锁 · 演示内容':'免费试读 · 章节02需激活';$('progressBar').style.width=(VISITED.size/CHAPTERS.length*100)+'%';$('readingChapter').textContent=`第${String(num+1).padStart(2,'0')}章`;$('savedCount').textContent=saved.size;$('nextChapter').textContent=num===0?'下一章 →':'返回书架 →';$('readerLayout').classList.toggle('night',night);$('storyText').classList.toggle('no-gloss',!gloss);$('toggleGloss').classList.toggle('pressed',!gloss);$('toggleNight').classList.toggle('pressed',night);$('toggleNight').textContent=night?'☀ 日间':'☾ 夜间';$('nextChapter').onclick=()=>num===0?openChapter(1):navigate('library');let side=$('readingStatus').closest('.side-panel');let extra=side.querySelector('#readerLearningStats');if(!extra){extra=document.createElement('div');extra.id='readerLearningStats';side.appendChild(extra)}extra.innerHTML=`<div class="metric"><span>待学习词汇（演示）</span><strong>${Object.keys(WORDS).length-touchedWords().length}</strong></div><div class="metric"><span>今天待复习</span><strong>${dueList().length}</strong></div>`;try{localStorage.setItem('miaowu_demo_lastchapter',String(num))}catch(e){} }
    function openWord(w){if(!WORDS[w])return;popWord=w;touchWord(w);const info=WORDS[w];$('wordPop').innerHTML=`<button class="modal-close" id="wordClose" aria-label="关闭">×</button><div class="eyebrow">MIAOWU · WORD IN STORY</div><h3>${safe(w)}</h3><div class="pron">${safe(info.phonetic)} · ${safe(info.part)}</div><div class="meaning">${safe(info.meaning)}</div><div class="context">故事原句：<br>${safe(info.context)}</div><div class="word-extra"><strong>额外例句</strong><br>${safe(info.example)}<br><span style="color:var(--muted)">${safe(info.translation)}</span></div><div class="word-extra"><strong>常用搭配</strong><br>${info.collocations.map(x=>safe(x[0])+' · '+safe(x[1])).join('<br>')}</div><div class="word-actions"><button id="wordSpeak">♫ 听发音</button><button id="wordSave">${saved.has(w)?'✓ 已收藏':'♡ 收藏藏书票'}</button></div>`;$('wordPop').classList.add('on');$('wordBackdrop').classList.add('on');$('wordClose').onclick=closeWord;$('wordSpeak').onclick=()=>speakWord(w);$('wordSave').onclick=()=>toggleWord(w)}
    function closeWord(){$('wordPop').classList.remove('on');$('wordBackdrop').classList.remove('on');popWord=null}
    function toggleWord(w){if(saved.has(w)){saved.delete(w);toast('已从本机演示收藏移除，学习记录继续保留')}else{saved.add(w);toast('已收藏到本机演示藏书票（仅此浏览器）')}saveWords();if(popWord===w)openWord(w);$('savedCount').textContent=saved.size;if(view==='words')renderWords()}
    function saveWords(){try{localStorage.setItem('miaowu_demo_words',JSON.stringify([...saved]));localStorage.setItem('miaowu_demo_mastered',JSON.stringify([...mastered]))}catch(e){}}
    function renderWords(){
      document.querySelectorAll('[data-word-filter]').forEach(x=>x.classList.toggle('active',x.dataset.wordFilter===wordFilter));
      const words=[...cloudSaved.values()].filter(w=>wordFilter==='all'||
        (wordFilter==='mastered'?w.status==='mastered':w.status!=='mastered'));
      const localWords=[...saved].filter(id=>WORDS[id]&&(wordFilter==='all'||
        (wordFilter==='mastered'?mastered.has(id):!mastered.has(id))));
      const cloudTotal=user?cloudSaved.size:0;
      const localTotal=saved.size;
      $('bookplateCount').textContent=String(cloudTotal+localTotal);
      if(!user&&!localWords.length){
        $('vocabGrid').innerHTML='<div class="empty" style="grid-column:1/-1">'+
          '<div class="big">♧</div><h3>登录后，打开你的云端藏书票</h3>'+
          '<p>登录同一账号即可在不同设备读取已收藏的单词。</p>'+
          '<button class="primary" id="cloudWordsLogin">登录我的书房</button></div>';
        $('cloudWordsLogin').onclick=showLogin;return;
      }
      if(!words.length&&!localWords.length){
        const hasSaved=cloudTotal+localTotal>0;
        $('vocabGrid').innerHTML='<div class="empty" style="grid-column:1/-1">'+
          '<div class="big">♧</div><h3>'+(hasSaved?'这个筛选下暂无藏书票':'第一张藏书票，等你来收下')+'</h3>'+
          '<p>'+(hasSaved?'试试切换「全部收藏」，查看其它学习状态的词卡。':'打开《玫瑰未落幕》可以收藏本机演示词卡；正式小说词卡将在上线后支持云端同步。')+'</p>'+
          '<button class="primary" id="emptyRead">寻找故事 →</button></div>';
        $('emptyRead').onclick=()=>navigate('library');return;
      }
      const cloudCards=user?words.map(w=>{
        const mastered=w.status==='mastered';
        const pairs=Array.isArray(w.collocations)?w.collocations:[];
        return '<div class="vocab-card status-'+(mastered?'mastered':'learning')+'">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">'+
          '<span class="eyebrow">MIAOWU · BOOKPLATE</span>'+
          '<span class="word-status">'+(mastered?'✓ 已掌握':'◷ 学习中')+'</span></div>'+
          '<h3>'+safe(w.headword)+'</h3><p class="vocab-phonetic">'+
          safe(w.phonetic_us||w.phonetic_uk||'')+
          ' <button data-cloud-voice="'+safe(w.word_id)+'" aria-label="播放发音">♫</button></p>'+
          '<p>'+safe(w.part_of_speech||'')+' '+safe(w.meaning_zh||'')+'</p>'+
          '<div class="vocab-section"><b>故事中的原句</b>'+
          '<div class="vocab-example">'+safe(w.context_sentence||'请在已解锁的正文中找到这个词。')+'</div></div>'+
          '<div class="vocab-section"><b>例句 / EXAMPLE</b><div class="vocab-example">'+
          safe(w.example_en||'待补充')+'</div><p class="vocab-translation">'+safe(w.example_zh||'')+'</p></div>'+
          '<div class="vocab-section"><b>常用搭配 / COLLOCATIONS</b>'+
          pairs.map(p=>'<div class="vocab-collocation"><span>'+safe(p.en||'')+'</span><span>'+
            safe(p.zh||'')+'</span></div>').join('')+'</div>'+
          '<div class="card-tools"><button data-cloud-say="'+safe(w.word_id)+'">♫ 发音</button>'+
          '<button data-cloud-master="'+safe(w.word_id)+'">'+(mastered?'↻ 改为学习中':'✓ 标记已掌握')+'</button>'+
          '<button data-cloud-remove="'+safe(w.word_id)+'">移除收藏</button></div></div>';
      }).join(''):'';
      const demoCards=localWords.map(id=>{
        const w=WORDS[id],isMastered=mastered.has(id);
        return '<div class="vocab-card demo-vocab-card status-'+(isMastered?'mastered':'learning')+'">'+
          '<div class="bookplate-card-top"><span class="eyebrow">MIAOWU · DEMO BOOKPLATE</span>'+
          '<span class="word-status">'+(isMastered?'✓ 已记住':'◷ 学习中')+'</span></div>'+
          '<h3>'+safe(id)+'</h3><p class="vocab-phonetic">'+safe(w.phonetic||'')+
          ' <button data-demo-voice="'+safe(id)+'" aria-label="播放发音">♫</button></p>'+
          '<p>'+safe(w.part||'')+' '+safe(w.meaning||'')+'</p>'+
          '<div class="vocab-section"><b>《玫瑰未落幕》演示原句</b>'+
          '<div class="vocab-example">'+safe(w.context||'')+'</div></div>'+
          '<div class="vocab-section"><b>例句 / EXAMPLE</b>'+
          '<div class="vocab-example">'+safe(w.example||'')+'</div>'+
          '<p class="vocab-translation">'+safe(w.translation||'')+'</p></div>'+
          '<div class="vocab-section"><b>常用搭配 / COLLOCATIONS</b>'+
          (w.collocations||[]).map(pair=>'<div class="vocab-collocation"><span>'+
            safe(pair[0])+'</span><span>'+safe(pair[1])+'</span></div>').join('')+'</div>'+
          '<div class="card-tools"><button data-demo-say="'+safe(id)+'">♫ 发音</button>'+
          '<button data-demo-master="'+safe(id)+'">'+(isMastered?'↻ 改为学习中':'✓ 标记已掌握')+'</button>'+
          '<button data-demo-remove="'+safe(id)+'">移除收藏</button></div></div>';
      }).join('');
      const sources='<div class="bookplate-source-summary">云端词卡 '+cloudTotal+
        ' 张 · 本机演示收藏 '+localTotal+' 张'+
        '<small>本机演示词卡仅保存在当前浏览器，不与账号同步；正式内容的收藏由云端保存。</small></div>';
      const cloudSection=cloudCards?'<div class="bookplate-source-heading">☁ 云端收藏 · 已同步到账号</div>'+cloudCards:'';
      const demoSection=demoCards?'<div class="bookplate-source-heading">✦ 本机演示收藏 · 《玫瑰未落幕》</div>'+demoCards:'';
      $('vocabGrid').innerHTML=sources+cloudSection+demoSection;
      document.querySelectorAll('[data-demo-voice],[data-demo-say]').forEach(button=>{
        button.onclick=()=>speakWord(button.dataset.demoVoice||button.dataset.demoSay);
      });
      document.querySelectorAll('[data-demo-master]').forEach(button=>button.onclick=()=>{
        const id=button.dataset.demoMaster;
        if(!saved.has(id))return;
        if(mastered.has(id))mastered.delete(id);else mastered.add(id);
        saveWords();renderWords();
        toast(mastered.has(id)?'本机演示词已标记掌握':'本机演示词已改为学习中');
      });
      document.querySelectorAll('[data-demo-remove]').forEach(button=>button.onclick=()=>{
        const id=button.dataset.demoRemove;
        saved.delete(id);saveWords();renderWords();
        toast('已从本机演示收藏移除');
      });
      document.querySelectorAll('[data-cloud-voice],[data-cloud-say]').forEach(x=>{
        x.onclick=()=>{const w=cloudSaved.get(x.dataset.cloudVoice||x.dataset.cloudSay);if(w)speakWord(w.headword)};
      });
      async function update(id,bookmarked,status){
        try{
          await serverRequest('/api/me/words/'+encodeURIComponent(id),'PUT',{bookmarked,status});
          await refreshCloudLearning();renderWords();
          toast('词卡状态已保存到云端');
        }catch(error){toast(error.message)}
      }
      document.querySelectorAll('[data-cloud-master]').forEach(x=>x.onclick=()=>{
        const w=cloudSaved.get(x.dataset.cloudMaster);if(w)update(w.word_id,true,w.status==='mastered'?'learning':'mastered');
      });
      document.querySelectorAll('[data-cloud-remove]').forEach(x=>x.onclick=()=>{
        const w=cloudSaved.get(x.dataset.cloudRemove);if(w)update(w.word_id,false,w.status==='mastered'?'mastered':'learning');
      });
    }
    function confirmEchoExit(destination='setup'){
      if(echoPhase!=='playing'||quizIndex>=quizQuestions.length){echoPhase='setup';if(destination==='setup')renderQuiz();else navigate(destination);return}
      const done=quizIndex+(quizAnswer!==null?1:0);
      const destText=destination==='setup'?'返回玩法选择':'离开当前练习';
      showModal(`<span class="eyebrow">PAUSE YOUR STORY ECHO</span><h2 id="modalTitle">要结束本轮练习吗？</h2><p>你已经提交 ${done} / ${quizQuestions.length} 道题。已提交的学习记录会保留，当前未提交的题目不计成绩，整轮不标为完成。</p><div class="exit-summary"><strong>已完成 ${done} 道</strong><span>未完成 ${quizQuestions.length-done} 道 · 可随时重新选择玩法</span></div><div class="exit-actions"><button class="secondary-btn" id="echoResume">继续做题</button><button class="primary" id="echoConfirmExit">${destText}</button></div>`);
      $('echoResume').onclick=closeModal;
      $('echoConfirmExit').onclick=()=>{closeModal();echoPhase='setup';quizQuestions=[];quizAnswer=null;quizIndex=0;quizScore=0;quizHint=false;if(destination==='setup')renderQuiz();else navigate(destination)};
    }
    function renderEchoModeSwitch(){
      const area=$('echoModeSwitch');
      if(!area)return;
      const playing=echoMode==='cloud'?!!window.MiaowuCloudEcho?.running():
        echoPhase==='playing'&&quizIndex<quizQuestions.length;
      if(playing){area.innerHTML='';return}
      area.innerHTML='<div class="echo-mode-switch" role="group" aria-label="选择剧情回声模式">'+
        '<button type="button" class="echo-mode-button '+(echoMode==='demo'?'selected':'')+
        '" data-echo-mode="demo" aria-pressed="'+(echoMode==='demo')+'">✦ 故事演示练习</button>'+
        '<button type="button" class="echo-mode-button '+(echoMode==='cloud'?'selected':'')+
        '" data-echo-mode="cloud" aria-pressed="'+(echoMode==='cloud')+'">☁ 云端正式练习</button></div>'+
        '<p class="echo-mode-note">'+(echoMode==='demo'?
        '《玫瑰未落幕》的演示题目 · 练习记录仅保存在当前浏览器，不计入云端账号。':
        '仅从已发布、已读完且有阅读权限的正式章节出题，学习记录同步到账号。')+'</p>';
      area.querySelectorAll('[data-echo-mode]').forEach(button=>button.onclick=()=>{
        const next=button.dataset.echoMode;
        if(next===echoMode)return;
        echoMode=next;
        if(next==='demo')echoPhase='setup';
        renderQuiz();
      });
    }
    function renderQuiz(){
      const c=$('quizContainer');
      renderEchoModeSwitch();
      if(echoMode==='cloud'&&window.MiaowuCloudEcho){
        if(!user){
          c.innerHTML='<div class="echo-panel"><span class="eyebrow">STORY ECHO · YOUR REAL MEMORY</span><h3>登录后，从读过的故事里练习</h3><p class="echo-tip">云端剧情回声仅使用已读完、仍有权限阅读的正式章节。暂时也可以切换上方的「故事演示练习」体验三种玩法。</p><button class="primary" id="cloudEchoLogin">登录我的书房 →</button></div>';
          $('cloudEchoLogin').onclick=showLogin;
          return;
        }
        window.MiaowuCloudEcho.render();
        return;
      }
      if(echoPhase==='setup'){
        let chapters=echoAvailableChapters();
        const selection=echoScope==='custom'?`<div class="echo-batch-filter"><div class="echo-filter-caption"><strong>按书籍与章节范围快速筛选</strong><small>无需逐章勾选，支持未来多书目</small></div><div class="echo-filter-row"><label>小说<select id="echoBookSelect"><option value="all">全部已读书籍</option>${availablePublishedBooks().map(b=>`<option value="${b.id}" ${echoCustomBook===b.id?'selected':''}>《${safe(b.name)}》</option>`).join('')}</select></label><label>章节范围<select id="echoRangeSelect">${[{id:'all',name:'全部已读章节'},{id:'recent3',name:'最近3章'},{id:'recent10',name:'最近10章'},{id:'range',name:'指定起止章节'}].map(x=>`<option value="${x.id}" ${echoCustomRange===x.id?'selected':''}>${x.name}</option>`).join('')}</select></label></div>${echoCustomRange==='range'?`<div class="echo-range-row"><label>从第 <input type="number" id="echoFrom" min="1" max="${CHAPTERS.length}" value="${echoRangeStart}" aria-label="起始章节"> 章</label><label>至第 <input type="number" id="echoTo" min="1" max="${CHAPTERS.length}" value="${echoRangeEnd}" aria-label="结束章节"> 章</label></div>`:''}<p class="echo-tip">当前可复习 ${echoCustomChapters().length} 个已读演示章节 · 未阅读及未解锁章节不会纳入练习。</p></div>`:'';
        c.innerHTML=`<div class="echo-panel"><span class="eyebrow">DESIGN YOUR MEMORY SESSION</span><h3 class="echo-selector-heading">选一种喜欢的复习方式</h3><p class="echo-tip">《玫瑰未落幕》演示题库，仅保存在本机浏览器；可以只练一种，也可以混合三种玩法，每轮最多8题。</p><div class="echo-selector-title">01 · 选择练习范围</div><div class="echo-radio-group">${[{id:'chapter',t:'本章复习'},{id:'recent',t:'最近章节'},{id:'custom',t:'自选已读章节'},{id:'due',t:'今日到期词汇'}].map(x=>`<button class="echo-radio ${echoScope===x.id?'selected':''}" data-scope="${x.id}">${x.t}</button>`).join('')}</div>${selection}<div class="echo-selector-title">02 · 选择玩法（至少一项）</div><div class="echo-options">${ECHO_TYPES.map(t=>`<button data-type="${t.id}" class="echo-option ${echoTypes.has(t.id)?'selected':''}" aria-pressed="${echoTypes.has(t.id)}"><span class="echo-option-title">${t.symbol} ${t.title}</span><span class="echo-option-sub">${t.desc}</span><span class="echo-check">${echoTypes.has(t.id)?'✓ 已选择':'○ 点击加入'}</span></button>`).join('')}</div><div class="echo-footer-actions"><span class="echo-tip">${echoTypes.size}种玩法 · 本范围可出 ${quizPool().length} 道演示题</span><button class="primary" id="beginEcho">开始剧情回声 →</button></div></div>`;
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
        c.innerHTML=`<div class="quiz-card" style="text-align:center"><span class="eyebrow">MIAOWU · STORY ECHO</span><div class="stamp" style="margin:17px auto">喵呜<br>✦<br><small>记忆印章</small></div><h3>这次找回了 ${quizScore}/${quizQuestions.length} 道题</h3><p class="echo-tip">演示复习记录仅保存在当前浏览器，不会同步到正式账号。答错的词会加入本机待复习计划。</p><div class="hero-actions" style="justify-content:center"><button class="primary" id="quizRestart">重新选择玩法</button><button class="secondary-btn" id="quizBack">回到书架</button></div></div>`;
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
      c.innerHTML=`<div class="quiz-card"><div class="quiz-kicker"><span>STORY ECHO · ${ECHO_TYPES.find(x=>x.id===q.type).title}</span><span>${quizIndex+1} / ${quizQuestions.length}</span></div><div class="quiz-exit-row"><span>当前练习 · 随时可以更换玩法</span><button class="quiet-exit" type="button" id="echoExit">✕ 退出／换玩法</button></div>${answerHTML}${feedback}<div class="quiz-foot"><small>${answered?'演示答案已在本机记录；可继续或退出。':'演示题目只在本机记录；根据原剧情回忆。'}</small><button id="quizNext" class="primary" ${!answered?'disabled':''}>${quizIndex===quizQuestions.length-1?'查看本轮结果':'下一题 →'}</button></div></div>`;
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
      STAGING_ACCESS_REQUIRED:'测试站访问授权已过期。请刷新页面并输入 reviewer 测试站密码（不是妙屋用户密码）',
      INVALID_ORIGIN:'安全验证失败，请刷新页面重试',
      INVALID_PASSWORD_INPUT:'密码格式不正确。新密码至少10位、最长128位',
      PASSWORD_REUSE_NOT_ALLOWED:'新密码不能与原密码相同',
      INVALID_CURRENT_PASSWORD:'原密码不正确',
      PASSWORD_CHANGE_RETRY:'密码更新遇到并发变更，请重新登录后重试',
      INVALID_RECOVERY_INPUT:'请填写用户名、完整恢复码和符合要求的新密码',
      INVALID_RECOVERY_CREDENTIALS:'用户名或恢复码错误，或恢复码已经使用',
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
      if(!response.ok){const issue=new Error(apiErrors[data.error] || '请求失败（HTTP '+response.status+'）');issue.code=data.error;throw issue;}
      return data;
    }
    function applyServerAccount(data, move=false) {
      const name=data && data.user && data.user.username;
      user=name?{name}:null;
      grants=new Set(Array.isArray(data && data.categories)?data.categories.map(c=>c.slug):[]);
      if(activeCloud){
        // Discard a previously fetched protected test chapter on session changes.
        activeCloud=null;
        if(view==='reader'){navigate('library');$('storyText').textContent='';}
      }
      cloudSaved=new Map();cloudProgress=[];cloudSessionKey=user?.name||null;
      renderLibrary();renderAccount();renderReminder();
      refreshCloudLearning();
      if(view==='echo')renderQuiz();
      $('topAccount').textContent=user?'你好，'+user.name:'登录 / 激活';
      if(move)navigate('account');
    }
    async function loadServerSession(){
      try { applyServerAccount(await serverRequest('/api/auth/me')); }
      catch(error){
        applyServerAccount(null);
        if(error.code==='STAGING_ACCESS_REQUIRED')toast('测试站访问已过期，刷新网页后用 reviewer 密码重新验证');
      }
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
    function demoAccountSummary(){
      // Browser-local prototype state must never be mixed into cloud account statistics.
      const opened=[...VISITED].filter(i=>Number.isInteger(i)&&i>=0&&i<CHAPTERS.length);
      const records=Object.entries(reviewData||{}).filter(([word,item])=>
        !!WORDS[word]&&item&&typeof item==='object');
      const attempts=records.reduce((n,[,item])=>n+Math.max(0,Number(item.attempts)||0),0);
      const correct=records.reduce((n,[,item])=>n+Math.max(0,Number(item.correct)||0),0);
      const localSaved=[...saved].filter(w=>!!WORDS[w]).length;
      const localMastered=[...mastered].filter(w=>!!WORDS[w]).length;
      const cards=[
        {label:'体验过的章节',value:opened.length+'章'},
        {label:'本机收藏词卡',value:localSaved+'张'},
        {label:'演示已掌握词',value:localMastered+'个'},
        {label:'剧情回声已作答',value:attempts+'题'},
        {label:'本机待复习词',value:dueList().length+'个'}
      ];
      const names=opened.map(i=>'第'+(i+1)+'章 · '+CHAPTERS[i].title).join('、');
      return '<section class="account-demo-section" aria-label="本机演示学习记录">'+
        '<div class="account-demo-heading"><span class="eyebrow">LOCAL STORY PROGRESS · 体验记录</span>'+
        '<h3>《玫瑰未落幕》 · 本机学习记录</h3>'+
        '<p>这是当前浏览器的演示数据，不会同步到账号；同一浏览器切换账号仍可能看到这些记录。</p></div>'+
        '<div class="account-demo-stats">'+cards.map(x=>
          '<div class="account-demo-stat"><strong>'+safe(x.value)+'</strong>'+
          '<small>'+safe(x.label)+'</small></div>').join('')+'</div>'+
        '<p class="account-demo-recent">'+(opened.length?'已经打开：'+safe(names):
          '还未打开演示章节，可以从四级书架体验《玫瑰未落幕》。')+
        ' · 剧情回声答对 '+correct+' / '+attempts+' 题</p>'+
        '<p class="account-demo-note">上方是正式云端数据；演示章节只统计曾打开过，不等于正式“已读完”。清除浏览器网站数据会删除这些演示记录。</p>'+
        '<button class="secondary-btn" id="accountDemoRead">继续演示阅读 →</button>'+
        '</section>';
    }
    function renderAccount(){
      if(!user){
        $('accountPanel').innerHTML='<div class="onboarding" style="margin:0">'+
          '<span class="eyebrow">YOUR ACCOUNT</span><h3>还没有打开你的私人书房</h3>'+
          '<p>已有账号请登录；新用户可以使用一次性分类激活码注册。'+
          '云端阅读记录与收藏都将关联到你的账号。不要使用常用密码。</p>'+
          '<button class="primary" id="accountRegister">注册并激活</button>'+
          '<button class="secondary-btn" id="accountLogin" style="margin-left:8px">已有账号？登录</button></div>';
        $('accountRegister').onclick=showRegister;$('accountLogin').onclick=showLogin;return;
      }
      const ent=CATS.filter(c=>has(c.id));
      const completed=cloudProgress.filter(p=>p.completed_at);
      const books=new Set(cloudProgress.map(p=>p.book_id));
      const due=cloudDue();
      const mastered=[...cloudSaved.values()].filter(w=>w.status==='mastered').length;
      const recent=cloudProgress[0]||null;
      const stats=[{n:books.size+'本',t:'已开始阅读'},{n:completed.length+'章',t:'已完成章节'},
        {n:cloudSaved.size+'个',t:'云端已收藏词'},{n:mastered+'个',t:'标记已掌握'}];
      $('accountPanel').innerHTML='<div class="account-box">'+
        '<div class="account-row"><div class="avatar">'+safe(user.name[0].toUpperCase())+'</div>'+
        '<div><span class="eyebrow">YOUR PRIVATE SHELF</span>'+
        '<h2 style="font:normal 25px Songti SC,serif;color:var(--wine);margin:6px 0">'+
        safe(user.name)+' 的书房</h2>'+
        '<span style="font-size:12px;color:var(--muted)">妙屋英语 · Cloudflare D1 云端正式学习记录（不包括本机演示）</span></div></div>'+
        '<div class="account-stats">'+stats.map(x=>'<div class="account-stat"><strong>'+x.n+'</strong><small>'+
        x.t+'</small></div>').join('')+'</div>'+
        '<div class="account-reminder"><div><strong>♧ 记忆藏书票</strong>'+
        '<div class="echo-tip">到期词卡 '+due+' 张 · 已收藏 '+cloudSaved.size+
        ' 张 · 本机演示收藏 '+saved.size+' 张（仅此浏览器） · 剧情回声记录单独保存云端</div></div>'+
        '<button class="primary" id="accountStartReview">查看藏书票 →</button></div>'+
        '<div class="account-content"><div class="account-block"><h3>已解锁学习分类</h3>'+
        (ent.map(c=>'<span class="account-tag">✓ '+safe(c.name)+'</span>').join('')||
          '<p>暂无已解锁分类</p>')+
        '<p>分类授权由服务器核对，试看章开放，付费章仅授权账号可读。</p></div>'+
        '<div class="account-block"><h3>兑换新的学习分类</h3>'+
        '<p>输入通过官方渠道获得的激活码，解锁其他英语分类。每枚码对应一个分类。</p>'+
        '<button class="primary" id="doRedeem">＋ 兑换激活码</button></div></div>'+
        '<div class="account-expanded">'+
        '<div class="account-feature account-reading-feature"><span class="eyebrow">CURRENTLY READING · 继续阅读</span>'+
        '<h3>'+safe(recent?.book_title||'你的下一本故事')+'</h3>'+
        '<p>'+(recent?'最近读到第 '+recent.chapter_no+' 章 · 云端已保存':
          '从书架开始阅读一本故事，读完后云端会保存进度。')+'</p>'+
        '<button class="secondary-btn" id="accountResumeRead">'+(recent?'继续阅读 →':'探索书架 →')+'</button></div>'+
        '<div class="account-feature account-word-feature"><span class="eyebrow">MY MEMORY NOTES · 学习记录</span>'+
        '<h3>你的词汇足迹</h3><div class="account-mini-rows">'+
        '<span>到期词卡 <strong>'+due+'</strong></span>'+
        '<span>收藏词汇 <strong>'+cloudSaved.size+'</strong></span>'+
        '<span>学习中 <strong>'+(cloudSaved.size-mastered)+'</strong></span></div></div></div>'+
        demoAccountSummary()+
        '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">'+
        '<button class="secondary-btn" id="changePassword">修改登录密码</button>'+
        '<button class="secondary-btn" id="logout">退出账号</button></div></div>';
      $('doRedeem').onclick=showRedeem;
      $('changePassword').onclick=showChangePassword;
      $('accountStartReview').onclick=()=>navigate('words');
      $('accountDemoRead').onclick=()=>{category='cet4';navigate('library')};
      $('accountResumeRead').onclick=()=>{
        if(recent)openCloudBook({id:recent.book_id,title:recent.book_title},recent.category_slug||category);
        else navigate('library');
      };
      $('logout').onclick=async()=>{
        try{await serverRequest('/api/auth/logout','POST',{});applyServerAccount(null,true);toast('已退出账号')}
        catch(e){toast(e.message)}
      };
    }
    function showModal(html){$('modalContent').innerHTML=html;$('modalOverlay').classList.add('open');document.body.style.overflow='hidden'}function closeModal(){$('modalOverlay').classList.remove('open');document.body.style.overflow=''}

    function showRegister(opts={}){
      if(user){showRedeem();return;}
      showModal([
        '<span class="eyebrow">OPEN YOUR LIBRARY</span>',
        '<h2 id="modalTitle">注册并激活</h2>',
        '<p>设置用户名和登录密码，并输入获得的一次性分类激活码。你的阅读记录与藏书票会关联到这个账号。</p>',
        '<form id="registerForm">',
          '<div class="form-field"><label for="rName">自定义用户名</label>',
          '<input id="rName" autocomplete="username" minlength="3" maxlength="24" placeholder="3–24位字母、数字或下划线等" required></div>',
          '<div class="form-field"><label for="rPass">登录密码</label>',
          '<input id="rPass" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="至少10位，请勿使用常用密码" required></div>',
          '<div class="form-field"><label for="rCode">一次性分类激活码</label>',
          '<input id="rCode" autocomplete="off" placeholder="输入获得的分类激活码" required></div>',
          '<p class="helper">激活码由网站运营方通过指定渠道提供，当前不支持站内直接付款。分类权益及售后请以实际商品说明为准。</p>',
          '<div class="form-actions"><button type="submit" class="primary">创建书房并激活 →</button></div>',
          '<div id="formMessage"></div>',
        '</form>',
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
            if(result.recoveryCode)showRecoveryNotice(result.recoveryCode);
            else toast('书房创建成功，分类已开通');
          });
      };
    }
    function showLogin(){
      showModal([
        '<span class="eyebrow">WELCOME BACK</span>',
        '<h2 id="modalTitle">登录我的书房</h2>',
        '<p>使用已注册的用户名和密码登录，继续阅读并同步你的个人学习记录。</p>',
        '<form id="loginForm">',
          '<div class="form-field"><label for="lName">用户名</label>',
          '<input id="lName" autocomplete="username" placeholder="你注册的用户名" required></div>',
          '<div class="form-field"><label for="lPass">登录密码</label>',
          '<input id="lPass" type="password" autocomplete="current-password" placeholder="你设置的登录密码" required></div>',
          '<div class="form-actions"><button class="primary" type="submit">登录书房 →</button></div>',
          '<div id="formMessage"></div>',
        '</form>',
        '<div style="margin-top:16px"><button class="tiny-action" id="switchRegister">还没有账号？去注册激活</button>'+
        '<button class="tiny-action" id="forgotPassword" style="margin-left:12px">忘记密码？使用恢复码</button></div>'
      ].join(''));
      $('switchRegister').onclick=()=>showRegister();
      $('forgotPassword').onclick=showRecoverAccount;
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
    // A recovery code is a full account credential. Display only once.
    // Never save it in localStorage, an analytics event, log or query string.
    function showRecoveryNotice(code){
      showModal([
        '<span class="eyebrow">KEEP YOUR LIBRARY SAFE</span>',
        '<h2 id="modalTitle">请妥善保存账号恢复码</h2>',
        '<p>这是独立于密码的一次性恢复凭证。忘记密码时可以凭用户名和它找回已购买的英语分类、藏书票与阅读记录。请保存到你的密码管理器或离线安全位置。关掉后不能重新查看，只能登录后修改密码再生成。</p>',
        '<div class="onboarding" style="padding:14px;overflow-wrap:anywhere">',
          '<code id="recoveryCodeText">',safe(code),'</code>',
        '</div>',
        '<p class="helper">任何拿到此码的人都可能重置你的密码。不要发给他人、客服、群聊或截图公开。每次成功恢复或在正式环境修改密码，原恢复码即作废。</p>',
        '<div class="form-actions"><button type="button" class="secondary-btn" id="recoveryCopy">复制恢复码</button>',
        '<button class="primary" type="button" id="recoveryDone">我已安全保存</button></div>'
      ].join(''));
      $('recoveryCopy').onclick=async()=>{
        try{await navigator.clipboard.writeText(code);toast('已复制，请存入安全位置')}
        catch{toast('复制失败，请手动选择并保存恢复码')}
      };
      $('recoveryDone').onclick=closeModal;
    }
    function showRecoverAccount(){
      showModal([
        '<span class="eyebrow">ACCOUNT RECOVERY</span>',
        '<h2 id="modalTitle">使用恢复码重置密码</h2>',
        '<p>输入用户名及注册或上次修改密码时保存的恢复码。恢复成功后原码作废、其他设备退出登录，并生成新的恢复码。</p>',
        '<form id="recoveryForm">',
          '<div class="form-field"><label for="recoverName">用户名</label>',
          '<input id="recoverName" autocomplete="username" required></div>',
          '<div class="form-field"><label for="recoverCode">恢复码</label>',
          '<input id="recoverCode" autocomplete="off" spellcheck="false" required></div>',
          '<div class="form-field"><label for="recoverPassword">新密码</label>',
          '<input id="recoverPassword" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div>',
          '<div class="form-field"><label for="recoverPasswordConfirm">确认新密码</label>',
          '<input id="recoverPasswordConfirm" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div>',
          '<div class="form-actions"><button class="primary" type="submit">验证恢复码并重置密码</button></div>',
          '<div id="formMessage" role="alert"></div>',
        '</form>',
        '<p class="helper">如果恢复码也丢失，请联系官方支持渠道，不要把购买激活码当作恢复码。</p>'
      ].join(''));
      $('recoveryForm').onsubmit=e=>{
        e.preventDefault();const form=e.currentTarget;
        if($('recoverPassword').value!==$('recoverPasswordConfirm').value){
          formError('两次输入的新密码不一致');return;
        }
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/auth/recover','POST',{
            username:$('recoverName').value.trim(),
            recoveryCode:$('recoverCode').value.trim(),
            newPassword:$('recoverPassword').value
          }),
          result=>{
            $('recoverCode').value='';$('recoverPassword').value='';
            $('recoverPasswordConfirm').value='';
            closeModal();applyServerAccount(result,true);
            showRecoveryNotice(result.recoveryCode);
          });
      };
    }
    function showChangePassword(){
      if(!user){showLogin();return;}
      showModal([
        '<span class="eyebrow">ACCOUNT SECURITY</span>',
        '<h2 id="modalTitle">修改登录密码</h2>',
        '<p>需要验证当前密码。修改成功后，其余设备上的登录会失效，当前书房和学习记录不受影响。</p>',
        '<form id="passwordChangeForm">',
          '<div class="form-field"><label for="passwordCurrent">原密码</label>',
          '<input id="passwordCurrent" type="password" autocomplete="current-password" maxlength="128" required></div>',
          '<div class="form-field"><label for="passwordNext">新密码</label>',
          '<input id="passwordNext" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>',
          '<div class="form-field"><label for="passwordConfirm">确认新密码</label>',
          '<input id="passwordConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>',
          '<div class="form-actions"><button class="primary" type="submit">更新密码并注销旧设备</button></div>',
          '<div id="formMessage" role="alert"></div>',
        '</form>',
        '<p class="helper">正式环境改密后会签发新恢复码，请及时保存。仅凭购买激活码不能重置密码。</p>'
      ].join(''));
      $('passwordChangeForm').onsubmit=e=>{
        e.preventDefault();const form=e.currentTarget;
        const current=$('passwordCurrent').value;
        const next=$('passwordNext').value;
        if(next!==$('passwordConfirm').value){formError('两次输入的新密码不一致');return;}
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/auth/change-password','POST',{
            currentPassword:current,newPassword:next
          }),
          result=>{
            for(const id of ['passwordCurrent','passwordNext','passwordConfirm'])$(id).value='';
            closeModal();
            if(result.recoveryCode)showRecoveryNotice(result.recoveryCode);
            else toast('密码已更新，其他设备需要重新登录');
          });
      };
    }
    function showRedeem(){
      if(!user){showLogin();return;}
      showModal([
        '<span class="eyebrow">EXPAND YOUR LIBRARY</span>',
        '<h2 id="modalTitle">兑换新学习分类</h2>',
        '<p>当前账号：',safe(user.name),'。输入另一枚尚未使用的分类激活码，增加你的阅读权限。</p>',
        '<form id="redeemForm"><div class="form-field"><label for="redeemCode">新的分类激活码</label>',
        '<input id="redeemCode" autocomplete="off" placeholder="输入另一枚分类激活码" required></div>',
        '<div class="form-actions"><button class="primary" type="submit">验证并解锁 →</button></div>',
        '<div id="formMessage"></div></form>',
        '<p class="helper">同一账号可累积多个英语分类的阅读权限，具体内容与使用期限以购买时的权益说明为准。</p>'
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
            toast('学习分类已成功解锁');
          });
      };
    }
    function formError(s){$('formMessage').innerHTML=`<div class="form-message">${safe(s)}</div>`}
    function explain(){showModal(`<span class="eyebrow">HOW IT WORKS</span><h2 id="modalTitle">一部小说，一段词汇记忆</h2><p>这是一款将阅读、听书、词汇收藏与情节回忆组合在一起的互动阅读器。</p><div class="onboarding" style="padding:15px;margin:12px 0"><h3>01 · 先读故事</h3><p>第一章开放试读，点击酒红色英文词查义、听发音。</p><h3>02 · 收下藏书票</h3><p>收藏之后，你可以在「记忆藏书票」里复习。</p><h3>03 · 听见剧情回声</h3><p>可选不同玩法、章节范围，通过选择与拼写练习回忆词汇。</p><h3>04 · 解锁完整书架</h3><p>注册账号后使用一次性分类激活码解锁更多作品，实际开放内容以书架为准。</p></div><button class="primary" id="explainRead" style="width:100%">开始试读 →</button>`);$('explainRead').onclick=()=>{closeModal();openFirstCloudBook()}}
    function speakWord(w){if(!('speechSynthesis' in window)){toast('此浏览器暂不支持语音朗读');return}window.speechSynthesis.cancel();speaking=false;$('player').classList.remove('show');let u=new SpeechSynthesisUtterance(w);u.lang='en-US';u.rate=.82;window.speechSynthesis.speak(u)}
    function stopReading(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speaking=false;paused=false;utterances=[];$('player').classList.remove('show')}
    function startReading(){
      if(!('speechSynthesis' in window)){toast('此浏览器暂不支持朗读');return}
      if(activeCloud&&!activeCloud.chapterId){toast('请先打开一个可阅读的章节');return}
      stopReading();
      const segments=[];
      if(activeCloud?.chapterId&&Array.isArray(activeCloud.rawParagraphs)){
        // D1 token boundaries preserve the English pronunciation rather than
        // speaking inline English words with the Chinese synthetic voice.
        for(const p of activeCloud.rawParagraphs){
          if(typeof p==='string'){if(p.trim())segments.push({text:p,lang:'zh-CN'});continue}
          for(const token of p.segments||[]){
            if(typeof token.text==='string'&&token.text.trim())
              segments.push({text:token.text,lang:'zh-CN'});
            else if(typeof token.surface==='string'&&token.surface.trim())
              segments.push({text:token.surface,lang:'en-US'});
          }
        }
      }else{
        for(const line of CHAPTERS[chapter].parts){
          const pieces=line.split(/(\[\[[a-z]+\]\]（[^）]+）)/g).filter(Boolean);
          for(const piece of pieces){
            const match=piece.match(/^\[\[([a-z]+)\]\]（[^）]+）$/);
            segments.push({text:match?match[1]:piece,lang:match?'en-US':'zh-CN'});
          }
        }
      }
      if(!segments.length){toast('本章没有可朗读的内容');return}
      utterances=segments;speakIndex=0;speaking=true;paused=false;
      $('player').classList.add('show');
      $('playerState').textContent='章节正文朗读 · 中文与英文分段发音';
      $('playerPause').textContent='Ⅱ';speakNext();
    }
    function speakNext(){if(!speaking)return;if(speakIndex>=utterances.length){stopReading();toast('本章朗读结束');return}const seg=utterances[speakIndex++],u=new SpeechSynthesisUtterance(seg.text);u.lang=seg.lang;u.rate=seg.lang==='en-US'?.86:.94;u.onend=()=>{if(speaking)speakNext()};u.onerror=(e)=>{if(speaking&&e.error!=='interrupted')speakNext()};window.speechSynthesis.speak(u)}
    document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>navigate(el.dataset.nav));$('goHome').onclick=e=>{e.preventDefault();navigate('library')};$('heroRead').onclick=openFirstCloudBook;$('heroExplain').onclick=explain;$('readerBack').onclick=()=>navigate('library');$('openActivation').onclick=()=>user?showRedeem():showRegister();$('topAccount').onclick=()=>user?navigate('account'):showLogin();$('wordbookRead').onclick=()=>navigate('library');$('doEcho').onclick=()=>{if(activeCloud?.chapterId){echoMode='cloud';window.MiaowuCloudEcho?.useChapter(activeCloud.chapterId)}else{echoMode='demo';echoScope='chapter'}navigate('echo')};$('smallerFont').onclick=()=>{fontSize=Math.max(15,fontSize-1);$('storyText').style.fontSize=fontSize+'px'};$('biggerFont').onclick=()=>{fontSize=Math.min(25,fontSize+1);$('storyText').style.fontSize=fontSize+'px'};function changeGloss(){gloss=!gloss;$('storyText').classList.toggle('no-gloss',!gloss);$('toggleGloss').classList.toggle('pressed',!gloss);toast(gloss?'已显示释义':'已隐藏释义，可以尝试回忆')}$('toggleGloss').onclick=changeGloss;$('sideToggleGloss').onclick=changeGloss;$('toggleNight').onclick=flipTheme;$('globalThemeToggle').onclick=flipTheme;$('sideRead').onclick=startReading;$('topRead').onclick=startReading;$('playerPause').onclick=()=>{if(!speaking)return;if(paused){window.speechSynthesis.resume();paused=false;$('playerPause').textContent='Ⅱ';$('playerState').textContent='继续朗读'}else{window.speechSynthesis.pause();paused=true;$('playerPause').textContent='▶';$('playerState').textContent='已暂停'}};$('playerStop').onclick=stopReading;$('wordBackdrop').onclick=closeWord;$('modalClose').onclick=closeModal;$('modalOverlay').onclick=e=>{if(e.target===$('modalOverlay'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeWord()}});document.querySelectorAll('[data-word-filter]').forEach(el=>el.onclick=()=>{wordFilter=el.dataset.wordFilter;renderWords()});
    $('cloudFinishReading').onclick=finishCloudChapter;
    window.MiaowuChapterWords?.configure({
      request:serverRequest,refresh:refreshCloudLearning,
      user:()=>!!user,login:showLogin,toast,speak:speakWord,showWord:showCloudWord
    });
    window.MiaowuCloudEcho?.configure({
      request:serverRequest,refresh:refreshCloudLearning,progress:()=>cloudProgress,
      showModal,closeModal,navigate,toast,speak:speakWord
    });
    applyTheme();renderLibrary();renderReminder();renderWords();renderQuiz();renderAccount();loadServerSession();refreshCloudCategories();
  })();
  