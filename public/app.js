
  (()=>{
    'use strict';
    // Original approved design; D1 now powers the primary book, reader, saved words and progress views.
    let CATS=[{id:'cet4',en:'CET-4',name:'大学英语四级',sub:'核心词 · 故事精选',icon:'✦',available:true},{id:'cet6',en:'CET-6',name:'大学英语六级',sub:'更进一步',icon:'✧',available:false},{id:'postgrad',en:'POSTGRAD',name:'考研英语',sub:'学术与表达',icon:'❦',available:false},{id:'ielts',en:'IELTS',name:'雅思英语',sub:'世界阅读',icon:'✥',available:false}];
    const BOOKS=[{id:'rose',name:'玫瑰未落幕',desc:'一场错开的约定，一段尚未结束的故事。',kind:'one',tag:'离婚逆袭',illustration:'❦',status:'demo'},{id:'promise',name:'契约婚姻第七条',desc:'约定之外，有些心动从不遵守条款。',kind:'two',tag:'先婚后爱',illustration:'♧',status:'planned'},{id:'secret',name:'她的第二重身份',desc:'每一个名字的背后，都藏着未说出的故事。',kind:'three',tag:'身份反转',illustration:'✥',status:'planned'}];
    const WORDS={contract:{meaning:'合同；契约',phonetic:'/ˈkɒntrækt/',part:'n.',context:'她将那份 contract 轻轻推到桌面中央。'},indifferent:{meaning:'冷淡的；漠不关心的',phonetic:'/ɪnˈdɪfrənt/',part:'adj.',context:'他的神色看上去依旧 indifferent。'},confirm:{meaning:'确认；证实',phonetic:'/kənˈfɜːrm/',part:'v.',context:'她问他是否愿意 confirm 这个决定。'},hesitate:{meaning:'犹豫；迟疑',phonetic:'/ˈhezɪteɪt/',part:'v.',context:'她没有 hesitate，直接拿起了笔。'},signature:{meaning:'签名；署名',phonetic:'/ˈsɪɡnətʃər/',part:'n.',context:'协议上留下了她的 signature。'},evidence:{meaning:'证据；根据',phonetic:'/ˈevɪdəns/',part:'n.',context:'桌上还有一张可能成为 evidence 的照片。'},identity:{meaning:'身份；特征',phonetic:'/aɪˈdentəti/',part:'n.',context:'照片揭开了她的另一个 identity。'},transfer:{meaning:'转移；转让',phonetic:'/trænsˈfɜːr/',part:'v.',context:'新的文件涉及股份 transfer。'},reveal:{meaning:'揭示；透露',phonetic:'/rɪˈviːl/',part:'v.',context:'这封信也许会 reveal 更多线索。'},promise:{meaning:'承诺；答应',phonetic:'/ˈprɒmɪs/',part:'n./v.',context:'她想起曾经听到的 promise。'},approach:{meaning:'接近；方法',phonetic:'/əˈprəʊtʃ/',part:'v./n.',context:'脚步声从走廊另一端 approach。'},consequence:{meaning:'结果；后果',phonetic:'/ˈkɒnsɪkwəns/',part:'n.',context:'她知道，每个选择都有 consequence。'}};
    const WORD_EXTRAS={"contract": {"example": "The two companies signed a new contract.", "translation": "两家公司签署了一份新合同。", "collocations": [["sign a contract", "签订合同"], ["break a contract", "违反合同"]]}, "indifferent": {"example": "He seemed indifferent to her apology.", "translation": "他似乎对她的道歉无动于衷。", "collocations": [["be indifferent to", "对……漠不关心"], ["remain indifferent", "保持冷淡"]]}, "confirm": {"example": "Please confirm the meeting time.", "translation": "请确认会议时间。", "collocations": [["confirm a decision", "确认决定"], ["confirm details", "核实细节"]]}, "hesitate": {"example": "Do not hesitate to ask questions.", "translation": "请尽管提问，不必犹豫。", "collocations": [["hesitate to do", "犹豫是否做……"], ["without hesitation", "毫不犹豫地"]]}, "signature": {"example": "Please put your signature here.", "translation": "请在这里签名。", "collocations": [["put a signature", "签署姓名"], ["signature on a document", "文件上的签名"]]}, "evidence": {"example": "The police found new evidence.", "translation": "警方找到了新的证据。", "collocations": [["strong evidence", "有力证据"], ["provide evidence", "提供证据"]]}, "identity": {"example": "She kept her identity a secret.", "translation": "她对自己的身份保密。", "collocations": [["prove identity", "证明身份"], ["hidden identity", "隐藏身份"]]}, "transfer": {"example": "They plan to transfer the shares.", "translation": "他们计划转让股份。", "collocations": [["transfer ownership", "转让所有权"], ["transfer money", "转账"]]}, "reveal": {"example": "The letter may reveal the truth.", "translation": "这封信或许会揭示真相。", "collocations": [["reveal a secret", "透露秘密"], ["reveal the truth", "揭示真相"]]}, "promise": {"example": "She made a promise to her sister.", "translation": "她向妹妹许下了承诺。", "collocations": [["keep a promise", "遵守诺言"], ["break a promise", "违背诺言"]]}, "approach": {"example": "A stranger began to approach the door.", "translation": "一个陌生人开始靠近门口。", "collocations": [["approach a problem", "处理问题"], ["take an approach", "采用一种方法"]]}, "consequence": {"example": "Every choice has a consequence.", "translation": "每个选择都有后果。", "collocations": [["face the consequences", "面对后果"], ["serious consequences", "严重后果"]]}};
    Object.keys(WORD_EXTRAS).forEach(k=>Object.assign(WORDS[k],WORD_EXTRAS[k]));
    const CHAPTERS=[{title:'一纸协议',parts:['这只是一个用于测试阅读功能的场景片段，并非正式小说正文。窗外的雨敲打玻璃，客厅里只亮着一盏灯。','她将那份 [[contract]]（合同）轻轻推到桌面中央。对面的男人看上去依旧 [[indifferent]]（冷淡的），仿佛这不过是一次寻常的会面。','“我只想 [[confirm]]（确认）一件事。”她望着他，“这真的是你的决定吗？”','他没有回答。她也没有 [[hesitate]]（犹豫），拿起笔，在最后一页留下自己的 [[signature]]（签名）。','离开前，她发现文件下压着一张旧照片。也许，那会是一份重要的 [[evidence]]（证据）。']},{title:'藏在照片里的名字',parts:['这一章同样是临时交互文案，仅用于体验付费章节解锁与词汇功能。','照片背面的名字让她重新思考自己的 [[identity]]（身份）。那是一段不曾向任何人提起的往事。','律师寄来的邮件提到了股份 [[transfer]]（转让）。事情比她想象的复杂。','她将信纸折好，决定先不 [[reveal]]（透露）真相。某个遥远的 [[promise]]（承诺），仍然留在她的记忆里。','门外的脚步声逐渐 [[approach]]（接近）。她突然明白，每个决定都可能带来新的 [[consequence]]（后果）。']}];
    const QUIZ=[{q:'她把哪一种文件推到桌面中央？',hint:'提示：一份正式的书面约定。',choices:['contract','evidence','identity','promise'],correct:'contract',detail:'contract = 合同；契约。想起桌上的那份协议。'},{q:'她在文件最后一页留下了什么？',hint:'提示：这是签署协议时的一个动作。',choices:['approach','signature','transfer','reveal'],correct:'signature',detail:'signature = 签名。把词义和“落笔签字”的画面连在一起。'},{q:'他看上去冷淡的，哪个英文词更贴近？',hint:'提示：描述人物的态度。',choices:['indifferent','hesitate','confirm','consequence'],correct:'indifferent',detail:'indifferent = 冷淡的；漠不关心的。再次想起故事人物的神情。'}];
    const $=id=>document.getElementById(id);let view='library',category='cet4',chapter=0,gloss=true,night=(function(){try{return localStorage.getItem('miaowu_theme')==='dark'}catch(e){return false}})(),fontSize=(()=>{try{return Math.min(24,Math.max(12,Number(localStorage.getItem('miaowu_reader_font'))||18))}catch{return 18}})(),wordFilter='all',popWord=null,user=null,grants=new Set(),quizIndex=0,quizScore=0,quizAnswer=null,utterances=[],speakIndex=0,speaking=false,paused=false;
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
      const title=!user?'喵呜，欢迎来到你的故事书房':
        due?'喵呜，今天有 '+due+' 个单词等你复习':
        seen?'喵呜，你已收藏 '+seen+' 张词卡':'喵呜，读一段故事，收藏第一张词卡';
      const hint=!user?'登录后，阅读进度与词卡会自动同步到你的账号。':
        due?'这些词已经到复习时间。去剧情回声找回故事里的单词吧。':
        '打开记忆藏书票，继续复习你在小说中遇见的单词。';
      area.innerHTML='<div class="reminder-cat reminder-paw" aria-hidden="true">'+
        '<svg class="solid-cat-paw" viewBox="0 0 80 80" width="58" height="58" fill="currentColor" xmlns="http://www.w3.org/2000/svg">'+
        '<ellipse cx="15.5" cy="29" rx="7.7" ry="10.2" transform="rotate(-24 15.5 29)"/>'+
        '<ellipse cx="30.5" cy="17.5" rx="7.7" ry="11" transform="rotate(-8 30.5 17.5)"/>'+
        '<ellipse cx="48.5" cy="17.5" rx="7.7" ry="11" transform="rotate(8 48.5 17.5)"/>'+
        '<ellipse cx="64.5" cy="29" rx="7.7" ry="10.2" transform="rotate(24 64.5 29)"/>'+
        '<path d="M39.9 35.8c-7.5 0-11.6 5.2-16.1 11.7l-8.4 11.8c-3.4 5.4-2.7 12 2.2 14.2 4.4 2.2 8.6 1.8 14.1-.6 5.2-2.4 9.3-2.4 14.4 0 5.6 2.6 10.4 3.2 15 1.2 5.8-2.5 6.7-9 3.2-14.6l-8.2-11.4C51.7 41.2 47.1 35.8 39.9 35.8Z"/>'+
        '</svg></div>'+
        '<div class="reminder-content"><strong>'+safe(title)+'</strong><small>'+safe(hint)+'</small></div>'+
        '<button class="primary reminder-btn" id="reviewReminderBtn">'+
        (user?'查看记忆藏书票 →':'登录后同步 →')+'</button>';
      $('reviewReminderBtn').onclick=()=>user?(due?navigate('echo'):navigate('words')):showLogin();
      renderHomeStudyStats();
    }
    function renderHomeStudyStats(){
      const due=$('homeDueCount');
      if(!due)return;
      const total=cloudSaved.size;
      const mastered=[...cloudSaved.values()].filter(w=>w.status==='mastered').length;
      const finished=cloudProgress.filter(p=>Boolean(p.completed_at)).length;
      due.textContent=user?String(cloudDue()):'—';
      $('homeMasteredCount').textContent=user?String(mastered):'—';
      $('homeSavedCount').textContent=user?String(total):'—';
      $('homeChapterCount').textContent=user?String(finished):'—';
      for(const id of ['homeDueCount','homeMasteredCount','homeSavedCount','homeChapterCount']){
        $(id).dataset.ready=user?'true':'false';
      }
      $('homeStudyFoot').textContent=user?
        '小猫替你记下每一点进步，数据已与你的账号关联。':
        '登录后，这里会显示你的真实学习进度。';
      $('homeDueStat').onclick=()=>user?navigate('echo'):showLogin();
      $('homeMasteredStat').onclick=()=>user?navigate('words'):showLogin();
      $('homeSavedStat').onclick=()=>user?navigate('words'):showLogin();
      $('homeChaptersStat').onclick=()=>user?navigate('account'):showLogin();
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
    let echoMode='cloud',echoScope='recent',echoTypes=new Set(['fill','situation','spell']),echoPhase='setup',echoChapterSet=new Set([0]),quizQuestions=[],quizHint=false;
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

    function navigate(to){if(view==='echo'&&echoMode==='cloud'&&window.MiaowuCloudEcho?.running()){window.MiaowuCloudEcho.leave(to);return}if(view==='echo'&&echoMode==='demo'&&echoPhase==='playing'&&quizIndex<quizQuestions.length&&to!=='echo'){confirmEchoExit(to);return}if(view==='reader'&&to!=='reader'){closeWord();clearTimeout(readingSaveTimer);void saveReadingProgress({quiet:true});stopReading();}view=to;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+to));document.querySelectorAll('[data-nav]').forEach(el=>{el.classList.toggle('on',el.dataset.nav===to);el.classList.toggle('active',el.dataset.nav===to)});window.scrollTo({top:0,behavior:'instant'});if(to==='library'){renderLibrary();renderReminder();}if(to==='words')renderWords();if(to==='echo')renderQuiz();if(to==='account')renderAccount();$('topAccount').textContent=user?('你好，'+user.name):'登录 / 激活'}

    // D1 is the primary reader source. Legacy chapter sample stays unreachable from default book cards.
    // No paid chapter bodies are bundled into app.js or held in a client-side book constant.
    let cloudListSequence=0;
    let shelfPage=1;
    const SHELF_PAGE_SIZE=9;
    let activeCloud=null;
    let cloudBooks=[],cloudSaved=new Map(),cloudProgress=[],cloudSessionKey=null,cloudLearningSequence=0;
    let initialSessionPromise=Promise.resolve(),heroResumeBusy=false;
    function updateHeroReadLabel(){
      const btn=$('heroRead');if(!btn)return;
      const title=user&&cloudProgress.length?'继续上次阅读':'开始阅读';
      // Keep the existing arrow icon and visual treatment intact.
      const label=btn.firstChild;
      if(label&&label.nodeType===3)label.textContent=title+' ';
      else btn.textContent=title+' →';
    }
    const glossaryCache=new Map();
    let readingSaveTimer=0,readingLastSave=0,readingSavePending=null;
    function applyReadingPrefs(){
      // Reading uses the global light/dark theme and one comfortable line height.
      const content=$('storyText');
      if(content){
        content.style.setProperty('line-height','2.15');
        content.style.setProperty('font-size',fontSize+'px');
      }
      const heading=$('chapterTitle');
      if(heading)heading.style.setProperty('font-size',Math.round(fontSize*1.75)+'px');
      const slider=$('readerFontSlider'),label=$('readerFontValue');
      if(slider)slider.value=String(fontSize);
      if(label)label.textContent=fontSize+'px';
      $('smallerFont').disabled=fontSize<=12;
      $('biggerFont').disabled=fontSize>=24;
      $('readerLayout')?.removeAttribute('data-reader-tone');
      try{
        localStorage.setItem('miaowu_reader_font',String(fontSize));
        localStorage.removeItem('miaowu_reader_tone');
        localStorage.removeItem('miaowu_reader_line');
      }catch{}
    }
    function readingFraction(){
      const content=$('storyText');
      if(!activeCloud?.chapterId||!content?.offsetHeight)return 0;
      const start=window.scrollY+content.getBoundingClientRect().top;
      const viewport=window.scrollY+innerHeight*.45;
      const fraction=(viewport-start)/Math.max(1,content.offsetHeight-innerHeight*.4);
      return Math.min(.995,Math.max(.01,fraction));
    }
    async function saveReadingProgress({complete=false,quiet=true,started=false}={}){
      if(!user||!activeCloud?.chapterId)return true;
      const id=activeCloud.chapterId,amount=complete?1:started?.01:readingFraction();
      if(!complete&&!started&&amount<=.015)return true;
      try{
        if(readingSavePending)await readingSavePending;
        const job=serverRequest('/api/me/progress','POST',{chapterId:id,progress:amount});
        readingSavePending=job;
        await job;readingLastSave=Date.now();readingSavePending=null;
        const row=cloudProgress.find(x=>x.chapter_id===id);
        if(row){
          row.progress=Math.max(Number(row.progress)||0,amount);
          if(complete)row.completed_at=row.completed_at||new Date().toISOString();
          row.updated_at=new Date().toISOString();
          cloudProgress=[row,...cloudProgress.filter(p=>p.chapter_id!==id)];
        }else cloudProgress.unshift({chapter_id:id,book_id:activeCloud.bookId,chapter_no:
          activeCloud.chapters.find(x=>x.id===id)?.chapterNo||0,
          book_title:activeCloud.title,category_slug:activeCloud.slug,
          progress:amount,completed_at:complete?new Date().toISOString():null,
          updated_at:new Date().toISOString()});
        updateHeroReadLabel();
        // Never display "synced" before the server confirms the write.
        if(activeCloud?.chapterId===id)showCloudProgress(id);
        updateCloudShelfProgress();
        if(complete)await refreshCloudLearning();
        return true;
      }catch(error){
        readingSavePending=null;
        if(!quiet)toast('阅读进度未能同步：'+error.message+'；请重试');
        return false;
      }
    }
    function queuePartialProgress(){
      if(view!=='reader'||!user||!activeCloud?.chapterId)return;
      clearTimeout(readingSaveTimer);
      // At most one partial sync roughly every 30 seconds during continuous
      // scrolling; leaving a chapter still saves immediately and explicitly.
      if(Date.now()-readingLastSave<30000)return;
      readingSaveTimer=setTimeout(()=>{saveReadingProgress({quiet:true})},1400);
    }
    window.addEventListener('scroll',queuePartialProgress,{passive:true});
    window.addEventListener('pagehide',()=>{
      if(!user||!activeCloud?.chapterId)return;
      const fraction=readingFraction();if(fraction<=.015)return;
      try{navigator.sendBeacon('/api/me/progress',new Blob([JSON.stringify({
        chapterId:activeCloud.chapterId,progress:fraction})],{type:'application/json'}))}catch{}
    });

    let cloudReviewDue=0,cloudFlashDue=0;
    const cloudDue=()=>cloudReviewDue;
    async function refreshCloudLearning(){
      const requested=user?.name||null,seq=++cloudLearningSequence;
      if(!requested){cloudSaved=new Map();cloudProgress=[];cloudReviewDue=0;cloudFlashDue=0;return}
      try{
        const [words,progress,stats]=await Promise.all([
          serverRequest('/api/me/words'),serverRequest('/api/me/progress'),
          serverRequest('/api/me/echo/stats')
        ]);
        if(seq!==cloudLearningSequence||user?.name!==requested)return;
        // Reading decisions change sense state even when the user has not bookmarked.
        // Do not reuse a prior chapter's "new word" flags after choosing Remember.
        glossaryCache.clear();
        cloudSaved=new Map((words.words||[]).map(w=>[w.word_id,w]));
        cloudReviewDue=Number(stats.due)||0;
        cloudFlashDue=Number(words.flashDue)||0;
        cloudProgress=progress.progress||[];
        updateHeroReadLabel();
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
    function latestReadableProgress(rows){
      // /api/me/progress is newest-first and already filters out withdrawn or
      // inaccessible chapters, so never use another user's local browser data.
      return (Array.isArray(rows)?rows:[]).find(p=>
        p&&typeof p.book_id==='string'&&p.book_id&&
        typeof p.chapter_id==='string'&&p.chapter_id&&
        typeof p.category_slug==='string'&&p.category_slug)||null;
    }
    function chooseFirstStory(){
      navigate('library');
      requestAnimationFrame(()=>$('bookGrid')?.scrollIntoView({behavior:'smooth',block:'start'}));
      toast('挑选一本喜欢的小说开始阅读，登录后会自动记住进度。');
    }
    async function resumeLatestReading(){
      if(heroResumeBusy)return;
      heroResumeBusy=true;
      const button=$('heroRead');button.disabled=true;
      try{
        // The homepage can be clicked before /api/auth/me finishes loading.
        await initialSessionPromise;
        if(!user){chooseFirstStory();return;}
        const currentUser=user.name;
        const result=await serverRequest('/api/me/progress');
        if(user?.name!==currentUser)return;
        const list=Array.isArray(result.progress)?result.progress:[];
        cloudProgress=list;updateHeroReadLabel();updateCloudShelfProgress();
        const recent=latestReadableProgress(list);
        if(!recent){chooseFirstStory();return;}
        category=recent.category_slug;
        await openCloudBook({id:recent.book_id,title:recent.book_title||'继续阅读'},
          recent.category_slug,{resumeChapterId:recent.chapter_id});
      }catch(error){
        toast('上次阅读记录暂时无法加载，请从书架选择小说。');
        navigate('library');
      }finally{
        heroResumeBusy=false;button.disabled=false;
      }
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
          started?'已读完 '+completed+' 章 · 已同步阅读进度':'尚未开始阅读';
        if(ratio)ratio.textContent=total?completed+' / '+total+' 章':'尚无已发布章节';
        if(line)line.style.width=(total?Math.min(100,Math.round(completed/total*100)):0)+'%';
      });
    }
    function renderShelfPagination(slug,meta){
      const list=$('bookGrid');
      const totalPages=Math.max(0,Math.floor(Number(meta?.totalPages)||0));
      const total=Math.max(0,Math.floor(Number(meta?.total)||0));
      if(totalPages<=1)return;
      const nav=document.createElement('nav');
      nav.className='shelf-pagination';
      nav.setAttribute('aria-label','小说书架分页');
      const info=document.createElement('span');
      info.className='shelf-page-summary';
      info.textContent='共 '+total+' 本 · 每页 '+SHELF_PAGE_SIZE+' 本';
      const controls=document.createElement('div');controls.className='shelf-page-controls';
      function addPage(label,page,{current=false,disabled=false,ariaLabel=''}={}){
        const button=document.createElement('button');
        button.type='button';button.className='shelf-page-button'+(current?' is-current':'');
        button.textContent=label;
        button.disabled=disabled||current;
        if(ariaLabel)button.setAttribute('aria-label',ariaLabel);
        if(current)button.setAttribute('aria-current','page');
        button.addEventListener('click',()=>{
          if(page<1||page>totalPages||page===shelfPage)return;
          shelfPage=page;
          void loadCloudBookCards(slug);
          const heading=$('selectedCategoryTitle');
          if(heading)heading.scrollIntoView({behavior:
            window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',
            block:'start'});
        });
        controls.append(button);
      }
      addPage('上一页',shelfPage-1,{disabled:shelfPage<=1,ariaLabel:'上一页小说'});
      const candidates=[1,totalPages,shelfPage-1,shelfPage,shelfPage+1]
        .filter(p=>p>=1&&p<=totalPages);
      const visible=[...new Set(candidates)].sort((a,b)=>a-b);
      visible.forEach((p,i)=>{
        if(i&&p-visible[i-1]>1){
          const ellipsis=document.createElement('span');
          ellipsis.className='shelf-page-ellipsis';ellipsis.textContent='…';
          ellipsis.setAttribute('aria-hidden','true');controls.append(ellipsis);
        }
        addPage(String(p),p,{current:p===shelfPage,ariaLabel:'第 '+p+' 页'});
      });
      addPage('下一页',shelfPage+1,{disabled:shelfPage>=totalPages,ariaLabel:'下一页小说'});
      nav.append(info,controls);list.append(nav);
    }
    async function loadCloudBookCards(slug){
      const seq=++cloudListSequence;
      const list=$('bookGrid');
      list.innerHTML='<div class="onboarding cloud-loading" style="grid-column:1/-1"><span class="eyebrow">YOUR STORY SHELF</span><h3>正在整理故事书架……</h3><p>为你翻开已经发布的故事。</p></div>';
      try{
        const response=await serverRequest('/api/books?category='+encodeURIComponent(slug)+
          '&page='+shelfPage);
        if(seq!==cloudListSequence||category!==slug||view!=='library')return;
        const books=Array.isArray(response.books)?
          response.books.filter(b=>b&&typeof b.id==='string'&&typeof b.title==='string'):[];
        const meta=response.pagination||{page:1,pageSize:SHELF_PAGE_SIZE,
          total:books.length,totalPages:Math.ceil(books.length/SHELF_PAGE_SIZE)};
        if(meta.totalPages>0&&shelfPage>meta.totalPages){
          shelfPage=meta.totalPages;
          return loadCloudBookCards(slug);
        }
        cloudBooks=books;
        list.replaceChildren();
        books.forEach((book,i)=>{
          const item=document.createElement('div');
          item.className='book-item cloud-book-item';
          const kind=['one','two','three'][i%3];
          const coverTitle=book.title;
          const coverLabel='STORY COLLECTION';
          const isRainyNight=book.id==='rainy-night-archives-cet4-v1';
          const coverVersion=/^cover-d1-([a-f0-9]{24})$/.exec(book.cover_key||'');
          const coverUrl=coverVersion?
            '/api/covers/'+encodeURIComponent(book.id)+'?v='+coverVersion[1]:
            isRainyNight?'/rainy-night-cover-v2.svg':'';
          const hasCover=Boolean(coverUrl);
          const coverTags=(Array.isArray(book.cover_tags)?book.cover_tags:[])
            .filter(t=>typeof t?.label==='string'&&/^#[0-9a-fA-F]{6}$/.test(t.color||''))
            .map(t=>'<span class="cover-custom-tag" style="--cover-tag-color:'+safe(t.color)+'">'+safe(t.label)+'</span>')
            .join('');
          const badge=has(slug)?'已解锁':'会员专享';
          const action=cloudProgress.some(p=>p.book_id===book.id)?'继续阅读 →':
            has(slug)?'开始阅读 →':'查看会员目录 →';
          item.innerHTML='<div class="book-cover '+kind+(hasCover?' rainy-night-published-cover':'')+'" aria-label="'+safe(book.title)+'">'+
            (hasCover?'<img src="'+safe(coverUrl)+'" alt="《'+safe(book.title)+'》小说封面" class="rainy-night-cover-image" loading="lazy" decoding="async">':'')+
            (coverTags?'<div class="cover-custom-tags" aria-label="小说标签">'+coverTags+'</div>':'')+
            '<span class="book-tag">'+safe(badge)+'</span>'+
            (hasCover?'':('<span class="edition">THE STORY EDITION / '+String(i+1).padStart(2,'0')+'</span>'+
            '<span class="illustration">'+['❦','♧','✥'][i%3]+'</span>'+
            '<h3>'+safe(coverTitle)+'</h3><span class="edition-bottom">'+safe(coverLabel)+'</span>'))+'</div>'+
            '<div class="book-info"><div class="line1"><h3 title="'+safe(book.title)+'">'+safe(book.title)+'</h3>'+
            '<span class="eyebrow">'+String(i+1).padStart(2,'0')+'</span></div>'+
            '<p>'+safe(book.description||'读一本舍不得合上的故事。')+'</p>'+
            '<div class="book-meta"><span class="pill">'+safe(slug.toUpperCase())+'</span>'+
            '<span class="pill">'+(has(slug)?'已拥有阅读权益':'解锁后阅读')+'</span></div>'+
            '<div class="shelf-progress" data-live-progress="'+safe(book.id)+'">'+
            '<div class="progress-text"><span>正在读取阅读记录</span><span>—</span></div>'+
            '<div class="progress-track"><div class="progress-fill" style="width:0%"></div></div></div>'+
            '<div class="book-actions"><button class="primary" type="button">'+action+'</button></div></div>';
          item.querySelector('.book-actions button').onclick=()=>openCloudBook(book,slug);
          list.append(item);
        });
        // Only published D1 books appear on the customer shelf.
        if(!books.length){
          const empty=document.createElement('div');
          empty.className='onboarding cloud-shelf-empty';
          empty.innerHTML='<span class="eyebrow">YOUR NEXT STORY</span>'+
            '<h3>更多故事正在路上</h3><p>这层书架暂无已发布作品，更多故事正在陆续加入。</p>';
          list.append(empty);
        }
        renderShelfPagination(slug,meta);
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
    async function openCloudBook(book,slug,{resumeChapterId=null}={}){
      try{
        const catalog=await serverRequest('/api/books/'+encodeURIComponent(book.id)+'/chapters');
        const chapters=Array.isArray(catalog.chapters)?catalog.chapters:[];
        if(!chapters.length){toast('这本书尚无已发布章节');return;}
        activeCloud={bookId:book.id,title:book.title,slug,chapters,chapterId:null,parts:[]};
        if(resumeChapterId){
          const target=chapters.find(ch=>ch.id===resumeChapterId);
          if(target&&(target.canRead||target.isPreview))return openCloudChapter(target.id);
        }
        showModal(`<span class="eyebrow">MIAOWU · STORY CHAPTERS</span><h2 id="modalTitle">${safe(book.title)}</h2>
          <p>点击章节即可开始阅读。会员章节仅对已解锁该学习分类的账号开放。</p>
          <div class="cloud-chapter-options">${chapters.map(ch=>`<button class="chapter-btn" type="button" data-cloud-choose="${safe(ch.id)}">${String(ch.chapterNo).padStart(2,'0')} · ${safe(ch.title)} ${ch.isPreview?'· 免费试读':(ch.canRead?'':'· 🔒 未解锁')}</button>`).join('')}</div>`);
        document.querySelectorAll('[data-cloud-choose]').forEach(btn=>{
          btn.onclick=()=>openCloudChapter(btn.dataset.cloudChoose);
        });
      }catch(error){toast(error.message||'章节目录加载失败');}
    }
    function renderD1Paragraph(paragraph,index){
      if(typeof paragraph==='string')return '<p data-audio-paragraph="'+index+'">'+safe(paragraph)+'</p>';
      const segments=Array.isArray(paragraph?.segments)?paragraph.segments:[];
      const html=segments.map(segment=>{
        if(typeof segment?.text==='string')return safe(segment.text);
        if(typeof segment?.wordId==='string' && typeof segment.surface==='string'){
          return '<button class="word cloud-word" data-cloud-word="'+safe(segment.wordId)+'">'+
            safe(segment.surface)+'</button><span class="gloss">（'+safe(segment.gloss||'')+'）</span>';
        }
        return '';
      }).join('');
      return '<p data-audio-paragraph="'+index+'">'+html+'</p>';
    }
    function cloudPlainText(paragraph){
      if(typeof paragraph==='string')return paragraph;
      return (Array.isArray(paragraph?.segments)?paragraph.segments:[])
        .map(s=>typeof s?.text==='string'?s.text:(s?.surface||'')).join('');
    }
    // The bottom study tray is stable across re-rendered chapters. It is not a
    // blocking mobile modal: readers can tap another highlighted word in place.
    let selectedStudyWordId=null,studyRequestSequence=0,studyAnchorEl=null;
    const studyMissingWordIds=new Set();
    function chapterStudyWordIds(){
      return [...new Set(Array.from($('storyText').querySelectorAll('[data-cloud-word]'))
        .map(el=>el.dataset.cloudWord).filter(Boolean))];
    }
    function showCloudWord(wordId,anchorEl=null){
      if(!activeCloud?.chapterId)return;
      if(anchorEl?.isConnected)studyAnchorEl=anchorEl;
      else if(!studyAnchorEl?.isConnected||studyAnchorEl.dataset.cloudWord!==wordId)
        studyAnchorEl=Array.from($('storyText').querySelectorAll('[data-cloud-word]'))
          .find(el=>el.dataset.cloudWord===wordId)||null;
      selectedStudyWordId=wordId;
      const ids=chapterStudyWordIds();
      const idx=ids.indexOf(wordId);
      const clicked=studyAnchorEl?.isConnected&&studyAnchorEl.dataset.cloudWord===wordId?
        studyAnchorEl:Array.from($('storyText').querySelectorAll('[data-cloud-word]'))
          .find(el=>el.dataset.cloudWord===wordId);
      const w=activeCloud.words?.get(wordId);
      const current=cloudSaved.get(wordId)||(w?.study_seen?{status:w.study_status,bookmarked:!!w.study_bookmarked}:null);
      const pairs=Array.isArray(w?.collocations)?w.collocations:[];
      const title=w?.headword||clicked?.textContent||'单词学习';
      const meaning=w?.meaning_zh||clicked?.nextElementSibling?.textContent?.replace(/[（）]/g,'')||'词义加载中…';
      const missingKey=activeCloud.chapterId+'::'+wordId;
      const loading=!w&&!studyMissingWordIds.has(missingKey);
      $('wordPop').innerHTML='<button class="modal-close" id="wordClose" type="button" aria-label="收起词卡">×</button>'+
        '<div class="study-navigation"><span class="eyebrow">MIAOWU · LEARN A WORD</span>'+
        '<span class="study-position">'+(idx>=0?idx+1:1)+' / '+Math.max(1,ids.length)+'</span></div>'+
        '<h3>'+safe(title)+'</h3>'+
        '<div class="pron">'+safe(w?.phonetic_us||w?.phonetic_uk||'')+
        ' <button id="wordSmallSpeak" class="word-voice-inline" type="button" aria-label="播放发音">♫</button> · '+safe(w?.part_of_speech||'')+'</div>'+
        '<div class="meaning">'+safe(meaning)+'</div>'+
        (!w&&!loading?'<p class="study-loading" role="status">暂无这张词卡的完整资料，请换一个单词学习。</p>':
        loading?'<p class="study-loading" role="status">正在读取这张词卡的学习资料…</p>':
          '<div class="word-extra"><strong>例句</strong><br>'+safe(w.example_en||'暂未提供')+
          '<br><span class="study-translation">'+safe(w.example_zh||'')+'</span></div>'+
          '<div class="word-extra"><strong>常用搭配</strong><br>'+
          (pairs.length?pairs.map(x=>safe(x.en||'')+' · '+safe(x.zh||'')).join('<br>'):'暂无搭配')+'</div>')+
        '<div class="study-switch"><button id="studyPrevious" type="button" '+(idx<=0?'disabled':'')+'>← 上一个词</button>'+
        '<button id="studyNext" type="button" '+(idx<0||idx===ids.length-1?'disabled':'')+'>下一个词 →</button></div>'+
        '<div class="word-actions"><button id="wordSpeak" type="button">♫ 听发音</button>'+
        '<button id="wordSave" type="button" '+(loading?'disabled':'')+'>'+(current?.bookmarked?'✓ 已收藏 · 移除':'♡ 收藏藏书票')+'</button>'+
        '<button id="cloudMaster" type="button" '+(loading?'disabled':'')+'>'+
        (current?.status==='mastered'?'↻ 继续学习':'✓ 标记已掌握')+'</button></div>';
      const mobileStudyTray=window.matchMedia('(max-width:700px)').matches;
      const tray=$('wordPop'),backdrop=$('wordBackdrop');
      document.documentElement.classList.add('study-tray-open');
      tray.classList.add('on');
      // Do not create a blocking full-screen overlay on iOS. On older cached
      // stylesheets the backdrop used to dim the page without a visible card.
      backdrop.classList.remove('on'); // Desktop uses a nonmodal anchored card; mobile uses the bottom tray.
      if(mobileStudyTray){
        backdrop.style.setProperty('display','none','important');
        backdrop.style.setProperty('pointer-events','none','important');
        tray.style.setProperty('position','fixed','important');
        tray.style.setProperty('display','block','important');
        tray.style.setProperty('visibility','visible','important');
        tray.style.setProperty('z-index','2147483000','important');
        tray.style.setProperty('top','auto','important');
        tray.style.setProperty('bottom','0','important');
        tray.style.setProperty('left','0','important');
        tray.style.setProperty('right','0','important');
        tray.style.setProperty('width','100%','important');
        tray.style.setProperty('max-width','100vw','important');
        tray.style.setProperty('max-height','65dvh','important');
        tray.style.setProperty('overflow-y','auto','important');
        tray.style.setProperty('background','var(--paper,#fffdfa)','important');
        tray.style.setProperty('color','var(--ink,#382b30)','important');
        tray.style.setProperty('border-radius','20px 20px 0 0','important');
        tray.style.setProperty('box-shadow','0 -12px 44px rgba(0,0,0,.24)','important');
        tray.style.setProperty('padding','18px 17px calc(18px + env(safe-area-inset-bottom))','important');
      }else{
        backdrop.style.removeProperty('display');
        backdrop.style.removeProperty('pointer-events');
        ['position','display','visibility','z-index','top','bottom','left','right',
          'width','max-width','max-height','overflow-y','background','color',
          'border-radius','box-shadow','padding'].forEach(prop=>tray.style.removeProperty(prop));
        positionStudyPopover();
      }
      $('storyText').querySelectorAll('[data-cloud-word]').forEach(el=>{
        el.classList.toggle('study-word-active',el.dataset.cloudWord===wordId);
      });
      $('wordClose').onclick=closeWord;
      $('wordSpeak').onclick=()=>speakWord(title);
      $('wordSmallSpeak').onclick=()=>speakWord(title);
      $('wordSave').onclick=()=>saveCloudWord(wordId,false);
      $('cloudMaster').onclick=()=>saveCloudWord(wordId,true);
      $('studyPrevious').onclick=()=>{if(idx>0)showCloudWord(ids[idx-1]);};
      $('studyNext').onclick=()=>{if(idx>=0&&idx<ids.length-1)showCloudWord(ids[idx+1]);};
      // Always display a card immediately. Vocabulary is fetched independently
      // of chapter body; a slow glossary must not make taps appear broken.
      if(loading){
        const requestId=++studyRequestSequence;
        const chapterId=activeCloud.chapterId;
        const key=(user?.name||'guest')+'::'+chapterId;
        const pending=glossaryCache.has(key)?
          Promise.resolve(glossaryCache.get(key)):
          serverRequest('/api/chapters/'+encodeURIComponent(chapterId)+'/words');
        pending.then(data=>{
          if(!activeCloud||activeCloud.chapterId!==chapterId)return;
          glossaryCache.set(key,data);
          if(!(activeCloud.words instanceof Map))activeCloud.words=new Map();
          for(const row of data.words||[])if(row?.word_id)activeCloud.words.set(row.word_id,row);
          if(!activeCloud.words.has(wordId))studyMissingWordIds.add(missingKey);
          if(requestId===studyRequestSequence&&selectedStudyWordId===wordId&&$('wordPop').classList.contains('on'))
            showCloudWord(wordId);
        }).catch(()=>{
          if(requestId===studyRequestSequence&&selectedStudyWordId===wordId){
            const notice=$('wordPop').querySelector('.study-loading');
            if(notice)notice.textContent='词汇资料暂时未加载，请稍后再点击重试。';
          }
        });
      }else{
        ++studyRequestSequence;
      }
    }
    function positionStudyPopover(){
      const tray=$('wordPop');
      if(!tray?.classList.contains('on')||window.matchMedia('(max-width:700px)').matches)return;
      const anchor=studyAnchorEl?.isConnected?studyAnchorEl:null;
      if(!anchor)return;
      const bounds=anchor.getBoundingClientRect();
      const margin=12, width=Math.min(370,window.innerWidth-margin*2);
      const cardHeight=Math.min(tray.scrollHeight||520,window.innerHeight*.72);
      const left=Math.max(margin,Math.min(window.innerWidth-width-margin,bounds.left));
      const placeBelow=window.innerHeight-bounds.bottom>Math.min(280,cardHeight);
      const top=placeBelow?Math.min(window.innerHeight-cardHeight-margin,bounds.bottom+9):
        Math.max(margin,bounds.top-cardHeight-9);
      tray.style.setProperty('position','fixed','important');
      tray.style.setProperty('left',Math.round(left)+'px','important');
      tray.style.setProperty('top',Math.round(top)+'px','important');
      tray.style.setProperty('right','auto','important');
      tray.style.setProperty('bottom','auto','important');
      tray.style.setProperty('width',Math.round(width)+'px','important');
      tray.style.setProperty('max-height','72vh','important');
      tray.style.setProperty('overflow-y','auto','important');
      tray.style.setProperty('z-index','2147483000','important');
    }
    window.addEventListener('resize',positionStudyPopover,{passive:true});
    window.addEventListener('scroll',positionStudyPopover,{passive:true});
    async function saveCloudWord(id,markMastered){
      if(!user){closeWord();showLogin();return}
      const w=activeCloud?.words?.get(id);
      if(!w)return;
      const old=cloudSaved.get(id)||(w.study_seen?{status:w.study_status,bookmarked:!!w.study_bookmarked}:null);
      const bookmarked=markMastered?true:!(old?.bookmarked);
      const status=markMastered?(old?.status==='mastered'?'learning':'mastered'):(old?.status||'learning');
      const action=$('wordSave');if(action)action.disabled=true;
      try{
        await serverRequest('/api/me/words/'+encodeURIComponent(id),'PUT',{bookmarked,status});
        w.study_seen=true;w.study_status=status;w.study_bookmarked=bookmarked;
        if(bookmarked)cloudSaved.set(id,{...w,word_id:id,status,bookmarked:1});
        else cloudSaved.delete(id);
        toast(bookmarked?'已同步到云端记忆生词本':'已从云端生词本移除');
        showCloudWord(id);
        refreshCloudLearning();
      }catch(error){toast(error.message);if(action)action.disabled=false}
    }
    function showCloudProgress(chapterId){
      if(!activeCloud)return;
      const savedProgress=cloudProgress.find(p=>p.chapter_id===chapterId);
      const finished=activeCloud.chapters.filter(ch=>cloudProgress.some(p=>p.chapter_id===ch.id&&p.completed_at)).length;
      $('readingStatus').textContent=!user?'免费阅读 · 登录可存进度':
        savedProgress?.completed_at?'✓ 已读完 · 已同步阅读进度':savedProgress?'✓ 已同步阅读进度':'阅读中 · 自动保存';
      $('progressBar').style.width=Math.round(finished/Math.max(1,activeCloud.chapters.length)*100)+'%';
      $('savedCount').textContent=cloudSaved.size;
      const unseenSenses=new Set(Array.from(activeCloud.words?.values()||[])
        .filter(w=>!w.study_seen).map(w=>w.study_key||w.word_id));
      $('readerUnseen').textContent=String(unseenSenses.size);
      $('readerDue').textContent=String(cloudDue());
      // Completed chapters are automatically recorded when the reader chooses 下一章.
    }
    let cloudChapterSequence=0;
    async function openCloudChapter(id,{finishPrevious=false}={}){
      if(!activeCloud)return;
      if(activeCloud.chapterId&&activeCloud.chapterId!==id&&view==='reader'){
        clearTimeout(readingSaveTimer);
        if(!(await saveReadingProgress({complete:finishPrevious,quiet:false})))return;
      }
      const book=activeCloud;
      closeWord();
      stopReading();
      // A chapter-list click must visibly respond before any network request.
      const selected=book.chapters.find(ch=>ch.id===id);
      if(!selected)return;
      const chosen=++cloudChapterSequence;
      $('readerLayout').classList.remove('chapter-drawer-open','vocab-drawer-open');
      closeModal();
      navigate('reader');
      $('chapterNo').textContent='CHAPTER '+String(selected.chapterNo).padStart(2,'0');
      $('chapterTitle').textContent=selected.title;
      $('readerCrumb').textContent=(book.slug||'STORY').toUpperCase()+' / '+book.title;
      $('storyText').innerHTML='<p class="cloud-reader-loading" role="status">正在打开章节，读取云端正文……</p>';
      $('nextChapter').disabled=true;
      $('doEcho').disabled=true;
      book.chapterId=null;
      window.MiaowuChapterWords?.openChapter(id);
      const key=(user?.name||'guest')+'::'+id;
      const glossaryPromise=glossaryCache.has(key)?
        Promise.resolve({ok:true,data:glossaryCache.get(key)}):
        serverRequest('/api/chapters/'+encodeURIComponent(id)+'/words')
          .then(data=>({ok:true,data}),error=>({ok:false,error}));
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
      $('chapterNo').textContent='CHAPTER '+String(page.chapterNo).padStart(2,'0')+(thisChapter?.isPreview?' · FREE PREVIEW':'');
      $('chapterTitle').textContent=page.title;
      $('storyText').innerHTML=parts.map(renderD1Paragraph).join('')||'<p>本章内容暂时无法显示，请稍后重试。</p>';
      // Delegated activation is shared by touch, mouse and keyboard and survives chapter rerenders.
      applyReadingPrefs();
      const savedAt=cloudProgress.find(x=>x.chapter_id===id);
      if(savedAt?.progress>0.025&&savedAt.progress<1){
        requestAnimationFrame(()=>{
          if(activeCloud===book&&book.chapterId===id&&view==='reader'){
            const body=$('storyText'),top=window.scrollY+body.getBoundingClientRect().top;
            window.scrollTo({top:top+Math.min(1,Number(savedAt.progress))*Math.max(0,body.offsetHeight-innerHeight*.4),
              behavior:'instant'});
          }
        });
      }
      $('readerCrumb').textContent=book.slug.toUpperCase()+' / '+book.title;
      const sideHeading=$('chapterList').parentElement.querySelector('h3');
      if(sideHeading)sideHeading.textContent=book.title+' · 目录';
      const sideCaption=$('chapterList').parentElement.querySelector('.side-caption');
      if(sideCaption)sideCaption.textContent='只显示已发布章节，未授权正文不会传到浏览器。';
      $('chapterList').innerHTML=book.chapters.map(ch=>`<button class="chapter-btn ${ch.id===id?'current':''}" data-cloud-chapter="${safe(ch.id)}" type="button">${String(ch.chapterNo).padStart(2,'0')} · ${safe(ch.title)} ${ch.isPreview?'· 免费':(ch.canRead?'':' · 🔒')}</button>`).join('');
      $('chapterList').querySelectorAll('[data-cloud-chapter]').forEach(btn=>btn.onclick=()=>openCloudChapter(btn.dataset.cloudChapter));
      $('readingChapter').textContent='第'+page.chapterNo+'章';
      showCloudProgress(id);
      // Opening a chapter is a reading event even if the user never scrolls.
      // Saving 1% records the last opened book without overwriting an existing
      // greater fraction or marking the chapter completed.
      void saveReadingProgress({started:true,quiet:true});
      $('storyText').classList.toggle('no-gloss',!gloss);
      $('toggleGloss').disabled=false;
      $('sideToggleGloss').disabled=false;
      $('doEcho').disabled=false;
      $('doEcho').title='练习本章已读单词并同步云端复习记录';
      $('nextChapter').textContent=next?'下一章 →':'返回书架 →';
      $('nextChapter').disabled=false;
      $('nextChapter').onclick=async()=>{
        if(next)return openCloudChapter(next.id,{finishPrevious:true});
        if(await saveReadingProgress({complete:true,quiet:false}))navigate('library');
      };
      const study=$('readerLayout').querySelector('#readerLearningStats');
      if(study)study.hidden=true;
      const glossary=await glossaryPromise;
      if(activeCloud!==book||chosen!==cloudChapterSequence||book.chapterId!==id)return;
      if(glossary.ok){
        if(!glossaryCache.has(key))glossaryCache.set(key,glossary.data);
        for(const row of (glossary.data.words||[])){
          if(row?.word_id)book.words.set(row.word_id,row);
        }
        window.MiaowuChapterWords?.setWords([...book.words.values()]);
        showCloudProgress(id);
      }else{
        toast('正文已打开，词汇列表暂未加载，请稍后重新打开章节。');
      }
    }
    function resetDemoReadingUI(){
      closeWord();activeCloud=null;
      const heading=$('chapterList').parentElement.querySelector('h3');
      if(heading)heading.textContent='《玫瑰未落幕》 · 目录';
      const caption=$('chapterList').parentElement.querySelector('.side-caption');
      if(caption)caption.textContent='仅有2章临时测试内容。正式版本计划每部25–35章。';
      $('toggleGloss').disabled=false;
      $('sideToggleGloss').disabled=false;
      $('doEcho').disabled=false;$('doEcho').title='';
      const study=$('readerLayout').querySelector('#readerLearningStats');
      if(study)study.hidden=false;
    }

    function renderLibrary(){
      const cat=$('categories');
      cat.innerHTML=CATS.map(c=>{
        const art=['cet4','cet6','postgrad','ielts'].includes(c.id)?
          '<img src="/shelf-'+c.id+'.svg?v=20261103-home-v17" class="category-illustration" alt="" aria-hidden="true" width="210" height="165" loading="lazy">':
          '<span class="category-icon">'+safe(c.icon)+'</span>';
        const english=/^CET-([46])$/.exec(c.en)?
          '<span class="category-level-prefix">CET</span><span class="category-level-number">-'+safe(c.en.slice(-1))+'</span>':
          safe(c.en);
        return '<button class="category '+(c.id===category?'selected':'')+
          ' available" data-category="'+safe(c.id)+'"><span class="category-en">'+english+
          '</span>'+art+'<strong>'+safe(c.name)+
          '</strong><small>'+safe(String(c.sub||'').replace(/待推出/g,'').replace(/[·•-]\s*$/,'').trim())+'</small><span class="category-tag">'+
          (has(c.id)?'✓ 已解锁':'● 可查看书架')+'</span></button>';
      }).join('');
      cat.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{
        category=el.dataset.category;shelfPage=1;cloudBooks=[];renderLibrary();
      });
      const picked=CATS.find(x=>x.id===category)||CATS[0];
      $('selectedCategoryEn').textContent=picked.en+' · STORY COLLECTION';
      $('selectedCategoryTitle').textContent=picked.name+' · 故事书架';
      loadCloudBookCards(category);
    }
    function splitPart(txt){const rg=/\[\[([a-z]+)\]\]（([^）]+)）/g;let last=0,html='',m;while((m=rg.exec(txt))){html+=safe(txt.slice(last,m.index));html+=`<button class="word" data-word="${m[1]}">${m[1]}</button><span class="gloss">（${safe(m[2])}）</span>`;last=rg.lastIndex}return html+safe(txt.slice(last))}
    function openChapter(num){resetDemoReadingUI();if(num>0&&!has('cet4')){showRegister({intent:'locked'});return}if(num<0||num>=CHAPTERS.length)return;chapter=num;VISITED.add(num);CHAPTER_WORDS[num].forEach(touchWord);saveReview();navigate('reader');$('chapterNo').textContent=`CHAPTER ${String(num+1).padStart(2,'0')} · ${num===0?'FREE PREVIEW':'MEMBER PREVIEW'}`;$('chapterTitle').textContent=CHAPTERS[num].title;$('storyText').innerHTML=CHAPTERS[num].parts.map(p=>`<p>${splitPart(p)}</p>`).join('');$('storyText').style.fontSize=fontSize+'px';$('readerCrumb').textContent='四级故事馆 / '+(num===0?'免费试读':'已购演示');$('chapterList').innerHTML=CHAPTERS.map((ch,i)=>`<button class="chapter-btn ${i===num?'current':''}" data-chapter="${i}">${String(i+1).padStart(2,'0')} · ${ch.title} ${i===1&&!has('cet4')?'🔒':''}</button>`).join('')+'<button class="chapter-btn" disabled>后续章节 · 内容筹备中</button>';document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>openChapter(Number(b.dataset.chapter)));document.querySelectorAll('.word').forEach(b=>b.onclick=()=>openWord(b.dataset.word));$('readingStatus').textContent=has('cet4')?'四级已解锁 · 演示内容':'免费试读 · 章节02需激活';$('progressBar').style.width=(VISITED.size/CHAPTERS.length*100)+'%';$('readingChapter').textContent=`第${String(num+1).padStart(2,'0')}章`;$('savedCount').textContent=saved.size;$('nextChapter').textContent=num===0?'下一章 →':'返回书架 →';$('readerLayout').classList.toggle('night',night);$('storyText').classList.toggle('no-gloss',!gloss);$('toggleGloss').classList.toggle('pressed',!gloss);$('toggleNight').classList.toggle('pressed',night);$('toggleNight').textContent=night?'☀ 日间':'☾ 夜间';$('nextChapter').onclick=()=>num===0?openChapter(1):navigate('library');let side=$('readingStatus').closest('.side-panel');let extra=side.querySelector('#readerLearningStats');if(!extra){extra=document.createElement('div');extra.id='readerLearningStats';side.appendChild(extra)}extra.innerHTML=`<div class="metric"><span>待学习词汇（演示）</span><strong>${Object.keys(WORDS).length-touchedWords().length}</strong></div><div class="metric"><span>今天待复习</span><strong>${dueList().length}</strong></div>`;try{localStorage.setItem('miaowu_demo_lastchapter',String(num))}catch(e){} }
    function openWord(w){if(!WORDS[w])return;popWord=w;touchWord(w);const info=WORDS[w];$('wordPop').innerHTML=`<button class="modal-close" id="wordClose" aria-label="关闭">×</button><div class="eyebrow">MIAOWU · WORD IN STORY</div><h3>${safe(w)}</h3><div class="pron">${safe(info.phonetic)} · ${safe(info.part)}</div><div class="meaning">${safe(info.meaning)}</div><div class="context">故事原句：<br>${safe(info.context)}</div><div class="word-extra"><strong>额外例句</strong><br>${safe(info.example)}<br><span style="color:var(--muted)">${safe(info.translation)}</span></div><div class="word-extra"><strong>常用搭配</strong><br>${info.collocations.map(x=>safe(x[0])+' · '+safe(x[1])).join('<br>')}</div><div class="word-actions"><button id="wordSpeak">♫ 听发音</button><button id="wordSave">${saved.has(w)?'✓ 已收藏':'♡ 收藏藏书票'}</button></div>`;$('wordPop').classList.add('on');$('wordBackdrop').classList.add('on');$('wordClose').onclick=closeWord;$('wordSpeak').onclick=()=>speakWord(w);$('wordSave').onclick=()=>toggleWord(w)}
    function closeWord(){
      ++studyRequestSequence;selectedStudyWordId=null;studyAnchorEl=null;
      const tray=$('wordPop'),backdrop=$('wordBackdrop');
      tray.classList.remove('on');backdrop.classList.remove('on');
      backdrop.style.removeProperty('display');
      backdrop.style.removeProperty('pointer-events');
      ['position','display','visibility','z-index','top','bottom','left','right',
        'width','max-width','max-height','overflow-y','background','color',
        'border-radius','box-shadow','padding'].forEach(prop=>tray.style.removeProperty(prop));
      document.documentElement.classList.remove('study-tray-open');
      $('storyText').querySelectorAll('[data-cloud-word]').forEach(el=>el.classList.remove('study-word-active'));
      popWord=null;
    }
    function toggleWord(w){if(saved.has(w)){saved.delete(w);toast('已从本机演示收藏移除，学习记录继续保留')}else{saved.add(w);toast('已收藏到本机演示藏书票（仅此浏览器）')}saveWords();if(popWord===w)openWord(w);$('savedCount').textContent=saved.size;if(view==='words')renderWords()}
    function saveWords(){try{localStorage.setItem('miaowu_demo_words',JSON.stringify([...saved]));localStorage.setItem('miaowu_demo_mastered',JSON.stringify([...mastered]))}catch(e){}}
    function renderWords(){
      globalThis.MiaowuFlashcards?.render({
        loggedIn:!!user,saved:cloudSaved.size,due:cloudFlashDue,
        sessionKey:user?.name||null
      });
      document.querySelectorAll('[data-word-filter]').forEach(x=>x.classList.toggle('active',x.dataset.wordFilter===wordFilter));
      const words=[...cloudSaved.values()].filter(w=>wordFilter==='all'||
        (wordFilter==='mastered'?w.status==='mastered':w.status!=='mastered'));
      const cloudTotal=user?cloudSaved.size:0;
      $('bookplateCount').textContent=String(cloudTotal);
      if(!user){
        $('vocabGrid').innerHTML='<div class="empty" style="grid-column:1/-1">'+
          '<div class="big">♧</div><h3>登录后，打开你的云端藏书票</h3>'+
          '<p>登录同一账号即可在不同设备读取已收藏的单词。</p>'+
          '<button class="primary" id="cloudWordsLogin">登录我的书房</button></div>';
        $('cloudWordsLogin').onclick=showLogin;return;
      }
      if(!words.length){
        const hasSaved=cloudTotal>0;
        $('vocabGrid').innerHTML='<div class="empty" style="grid-column:1/-1">'+
          '<div class="big">♧</div><h3>'+(hasSaved?'这个筛选下暂无藏书票':'第一张藏书票，等你来收下')+'</h3>'+
          '<p>'+(hasSaved?'试试切换「全部收藏」，查看其它学习状态的词卡。':'打开已解锁的故事，点击英文词汇即可收藏到记忆藏书票。')+'</p>'+
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
          '<div class="vocab-section"><b>例句 / EXAMPLE</b><div class="vocab-example">'+
          safe(w.example_en||'待补充')+'</div><p class="vocab-translation">'+safe(w.example_zh||'')+'</p></div>'+
          '<div class="vocab-section"><b>常用搭配 / COLLOCATIONS</b>'+
          pairs.map(p=>'<div class="vocab-collocation"><span>'+safe(p.en||'')+'</span><span>'+
            safe(p.zh||'')+'</span></div>').join('')+'</div>'+
          '<div class="card-tools"><button data-cloud-say="'+safe(w.word_id)+'">♫ 发音</button>'+
          '<button data-cloud-master="'+safe(w.word_id)+'">'+(mastered?'↻ 改为学习中':'✓ 标记已掌握')+'</button>'+
          '<button data-cloud-remove="'+safe(w.word_id)+'">移除收藏</button></div></div>';
      }).join(''):'';
      const sources='<div class="bookplate-source-summary">已同步词卡 '+cloudTotal+
        ' 张<small>这些词卡关联你的账号，可在登录后跨设备查看。</small></div>';
      const cloudSection=cloudCards?'<div class="bookplate-source-heading">☁ 云端收藏 · 已同步到账号</div>'+cloudCards:'';
      $('vocabGrid').innerHTML=sources+cloudSection;
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
      if(area)area.innerHTML='';
    }
    function renderQuiz(){
      const c=$('quizContainer');
      renderEchoModeSwitch();
      if(window.MiaowuCloudEcho){
        if(!user){
          c.innerHTML='<div class="echo-panel"><span class="eyebrow">STORY ECHO · YOUR REAL MEMORY</span><h3>登录后，从读过的故事里练习</h3><p class="echo-tip">云端剧情回声会根据已完成的章节生成练习，答题记录会自动同步。</p><button class="primary" id="cloudEchoLogin">登录我的书房 →</button></div>';
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
      ORDER_RECOVERY_UNAVAILABLE:'订单自助找回暂未开通，请联系官方售后人工处理',
      INVALID_ORDER_RECOVERY_INPUT:'请填写用户名、订单号、专属找回凭证和符合要求的新密码',
      INVALID_ORDER_RECOVERY_CREDENTIALS:'身份核验未通过，请检查订单号、账号和找回凭证',
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
      cloudSaved=new Map();cloudProgress=[];glossaryCache.clear();cloudSessionKey=user?.name||null;
      updateHeroReadLabel();
      renderLibrary();renderAccount();renderReminder();
      refreshCloudLearning();
      if(view==='echo')renderQuiz();
      $('topAccount').textContent=user?'你好，'+user.name:'登录 / 激活';
      if(move)navigate('account');
      window.MiaowuOnboarding?.sync(!!user,grants.size>0);
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
        '<span style="font-size:12px;color:var(--muted)">妙屋英语 · 我的云端学习记录</span></div></div>'+
        '<div class="account-stats">'+stats.map(x=>'<div class="account-stat"><strong>'+x.n+'</strong><small>'+
        x.t+'</small></div>').join('')+'</div>'+
        '<div class="account-reminder"><div><strong>♧ 记忆藏书票</strong>'+
        '<div class="echo-tip">到期词卡 '+due+' 张 · 已收藏 '+cloudSaved.size+
        ' 张 · 剧情回声学习记录同步到账户</div></div>'+
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
        '<p>'+(recent?'最近读到第 '+recent.chapter_no+' 章 · 已同步阅读进度':
          '从书架开始阅读一本故事，读完后云端会保存进度。')+'</p>'+
        '<button class="secondary-btn" id="accountResumeRead">'+(recent?'继续阅读 →':'探索书架 →')+'</button></div>'+
        '<div class="account-feature account-word-feature"><span class="eyebrow">MY MEMORY NOTES · 学习记录</span>'+
        '<h3>你的词汇足迹</h3><div class="account-mini-rows">'+
        '<span>到期词卡 <strong>'+due+'</strong></span>'+
        '<span>收藏词汇 <strong>'+cloudSaved.size+'</strong></span>'+
        '<span>学习中 <strong>'+(cloudSaved.size-mastered)+'</strong></span></div></div></div>'+
        '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">'+
        '<button class="secondary-btn" id="changePassword">修改登录密码</button>'+
        '<button class="secondary-btn" id="logout">退出账号</button></div></div>';
      $('doRedeem').onclick=showRedeem;
      $('changePassword').onclick=showChangePassword;
      $('accountStartReview').onclick=()=>navigate('words');
      $('accountResumeRead').onclick=()=>{
        if(recent)void resumeLatestReading();
        else chooseFirstStory();
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
          '<div class="mw-password-control"><input id="rPass" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="至少10位，请勿使用常用密码" required><button type="button" data-password-toggle="rPass" aria-label="显示登录密码">显示</button></div></div>',
          '<div class="form-field"><label for="rPassConfirm">确认登录密码</label>',
          '<div class="mw-password-control"><input id="rPassConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="再次输入登录密码" required><button type="button" data-password-toggle="rPassConfirm" aria-label="显示确认密码">显示</button></div><small id="registerMatchMessage" class="mw-password-feedback" role="status" aria-live="polite"></small></div>',
          '<div class="form-field"><label for="rCode">一次性分类激活码</label>',
          '<input id="rCode" autocomplete="off" placeholder="输入获得的分类激活码" required></div>',
          '<p class="helper">激活码由网站运营方通过指定渠道提供，当前不支持站内直接付款。分类权益及售后请以实际商品说明为准。</p>',
          '<div class="form-actions"><button type="submit" class="primary">创建书房并激活 →</button></div>',
          '<div id="formMessage"></div>',
        '</form>',
        '<div style="margin-top:15px"><button class="tiny-action" id="switchLogin">已有账号？去登录</button></div>'
      ].join(''));
      $('switchLogin').onclick=showLogin;
      const password=$('rPass'),confirmPassword=$('rPassConfirm'),matchMessage=$('registerMatchMessage');
      const updatePasswordMatch=()=>{
        matchMessage.textContent=confirmPassword.value&&password.value!==confirmPassword.value?'两次输入的密码不一致，请检查。':'';
      };
      password.addEventListener('input',updatePasswordMatch);
      confirmPassword.addEventListener('input',updatePasswordMatch);
      document.querySelectorAll('[data-password-toggle]').forEach(button=>button.onclick=()=>{
        const input=$(button.dataset.passwordToggle);
        const visible=input.type==='password';
        input.type=visible?'text':'password';
        button.textContent=visible?'隐藏':'显示';
        button.setAttribute('aria-label',(visible?'隐藏':'显示')+(input.id==='rPass'?'登录密码':'确认密码'));
      });
      $('registerForm').onsubmit=e=>{
        e.preventDefault();
        const form=e.currentTarget;
        updatePasswordMatch();
        if(password.value!==confirmPassword.value){
          formError('两次输入的密码不一致，请重新确认。');
          confirmPassword.focus();
          return;
        }
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/auth/register','POST',{
            username:$('rName').value.trim(),password:$('rPass').value,
            activationCode:$('rCode').value.trim()
          }),
          result=>{
            $('rPass').value='';$('rPassConfirm').value='';
            closeModal();
            applyServerAccount(result,true);
            toast('书房创建成功，分类已开通');
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
        '<button class="tiny-action" id="forgotPassword" style="margin-left:12px">忘记密码？订单找回</button></div>'
      ].join(''));
      $('switchRegister').onclick=()=>showRegister();
      $('forgotPassword').onclick=showOrderRecovery;
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
    // Recovery credentials must NOT be embedded in URLs or localStorage.
    // The order number alone cannot authorize a password reset.
    function showOrderRecovery(){
      showModal([
        '<span class="eyebrow">ORDER ACCOUNT RECOVERY</span>',
        '<h2 id="modalTitle">通过购买订单找回密码</h2>',
        '<p>适用于收到「订单专属找回凭证」的新订单。无需邮箱或手机号。</p>',
        '<form id="orderRecoveryForm">',
          '<div class="form-field"><label for="recoverUsername">注册用户名</label>',
          '<input id="recoverUsername" autocomplete="username" required maxlength="24"></div>',
          '<div class="form-field"><label for="recoverOrder">小红书订单编号</label>',
          '<input id="recoverOrder" autocomplete="off" required maxlength="64" placeholder="粘贴小红书订单号"></div>',
          '<div class="form-field"><label for="recoverKey">订单专属找回凭证</label>',
          '<input id="recoverKey" type="password" autocomplete="off" required placeholder="MW-REC- 开头的独立凭证"></div>',
          '<div class="form-field"><label for="recoverNext">新登录密码</label>',
          '<input id="recoverNext" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>',
          '<div class="form-field"><label for="recoverConfirm">确认新密码</label>',
          '<input id="recoverConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>',
          '<div class="form-actions"><button class="primary" type="submit">验证订单凭证并重置密码</button></div>',
          '<div id="formMessage" role="alert"></div>',
        '</form>',
        '<p class="helper">订单号不是密码，必须同时提供订单专属找回凭证。成功后旧凭证失效，需重新保存新凭证。</p>',
        '<button class="tiny-action" id="orderRecoverManual">旧订单没有凭证？申请人工找回</button>'
      ].join(''));
      $('orderRecoverManual').onclick=showManualRecovery;
      $('orderRecoveryForm').onsubmit=e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const next=$('recoverNext').value;
        if(next!==$('recoverConfirm').value){
          formError('两次输入的新密码不一致');return;
        }
        const btn=form.querySelector('button[type=submit]');
        btn.dataset.original=btn.textContent;
        submitServerForm(form,
          ()=>serverRequest('/api/auth/recover-by-order','POST',{
            username:$('recoverUsername').value.trim(),
            orderReference:$('recoverOrder').value.trim(),
            recoveryKey:$('recoverKey').value.trim(),
            newPassword:next
          }),
          result=>{
            $('recoverKey').value='';$('recoverNext').value='';$('recoverConfirm').value='';
            applyServerAccount(result,true);
            showModal([
              '<span class="eyebrow">ACCOUNT RESTORED</span>',
              '<h2 id="modalTitle">密码修改成功</h2>',
              '<p>原找回凭证已作废，其他设备已退出登录。下面是新的一次性找回凭证，请立即保存。</p>',
              '<div class="form-field"><label for="replacementRecoveryKey">新找回凭证</label>',
              '<textarea readonly id="replacementRecoveryKey" rows="3"></textarea></div>',
              '<p class="helper">请妥善保存；关闭后网站无法再次展示，也不会保存在本机浏览器。</p>',
              '<div class="form-actions"><button type="button" class="secondary-btn" id="copyReplacement">复制凭证</button>',
              '<button type="button" class="primary" id="finishRecovery">完成</button></div>'
            ].join(''));
            $('replacementRecoveryKey').value=result.recoveryKey||'';
            $('copyReplacement').onclick=async()=>{
              try{await navigator.clipboard.writeText($('replacementRecoveryKey').value);
                toast('找回凭证已复制，请安全保存');
              }catch{$('replacementRecoveryKey').select();toast('请长按选择并复制找回凭证');}
            };
            $('finishRecovery').onclick=closeModal;
          });
      };
    }
    function showManualRecovery(){
      showModal([
        '<span class="eyebrow">ACCOUNT SUPPORT</span>',
        '<h2 id="modalTitle">人工找回账号</h2>',
        '<p>旧订单未提供独立找回凭证，或凭证已遗失时，请联系妙屋英语官方售后，提供注册用户名和订单信息申请人工核验。无需邮箱、手机号。</p>',
        '<p class="helper">请勿向任何人提供旧密码、验证码或完整激活码。订单凭证仅用于核实购买关系，不能单独证明账号归属；核实通过后由管理员以一次性方式安全重置。</p>',
        '<div class="form-actions"><button class="primary" type="button" id="manualRecoveryDone">我知道了</button></div>'
      ].join(''));
      $('manualRecoveryDone').onclick=closeModal;
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
        '<p class="helper">若忘记旧密码，可在登录页使用订单编号及独立找回凭证自行重置。仅凭订单号不能重置。</p>'
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
            toast('密码已更新，其他设备需要重新登录');
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
    function explain(){showModal(`<span class="eyebrow">HOW IT WORKS</span><h2 id="modalTitle">一部小说，一段词汇记忆</h2><p>这是一款将阅读、听书、词汇收藏与情节回忆组合在一起的互动阅读器。</p><div class="onboarding" style="padding:15px;margin:12px 0"><h3>01 · 先读故事</h3><p>打开已解锁的章节，点击酒红色英文词查义、听发音。</p><h3>02 · 收下藏书票</h3><p>收藏之后，你可以在「记忆藏书票」里复习。</p><h3>03 · 听见剧情回声</h3><p>可选不同玩法、章节范围，通过选择与拼写练习回忆词汇。</p><h3>04 · 解锁完整书架</h3><p>注册账号后使用一次性分类激活码解锁更多作品，实际开放内容以书架为准。</p></div><button class="primary" id="explainRead" style="width:100%">去书架看看 →</button>`);$('explainRead').onclick=()=>{closeModal();openFirstCloudBook()}}
    // Device TTS remains unchanged. The player now supports paragraph/segment
    // navigation without pretending that speechSynthesis has audio timestamps.
    let speechGeneration=0;
    function speechStorageKey(){
      return 'miaowu_audio_position_'+(user?.name||'guest')+'_'+
        (activeCloud?.bookId||'story')+'_'+(activeCloud?.chapterId||'0');
    }
    function rememberSpeechPosition(index){
      try{localStorage.setItem(speechStorageKey(),String(index))}catch{}
    }
    function showSpeechPosition(index){
      const seek=$('playerSeek'),position=$('playerPosition');
      if(seek){
        seek.max=Math.max(0,utterances.length-1);
        seek.value=Math.min(Math.max(0,index),Math.max(0,utterances.length-1));
      }
      if(position)position.textContent=Math.min(index+1,utterances.length)+' / '+utterances.length+' 段';
    }
    function highlightSpeechParagraph(index){
      const paras=$('storyText')?.querySelectorAll('[data-audio-paragraph]')||[];
      paras.forEach(p=>p.classList.toggle('reading-current',
        Number(p.dataset.audioParagraph)===index));
    }
    function speakWord(w){
      if(!('speechSynthesis' in window)){toast('此浏览器暂不支持语音朗读');return}
      // The browser has a single SpeechSynthesis queue. Word audio can
      // interrupt a paused chapter, but closing the card NEVER auto-resumes it.
      if(speaking){
        chapterSpeechNeedsRestart=true;
        speechGeneration++; // invalidate the canceled chapter utterance callbacks
        window.speechSynthesis.cancel();
        paused=true;
        $('playerPause').textContent='▶';
        $('playerState').textContent='已暂停 · 点击继续朗读';
      }else window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(w);u.lang='en-US';u.rate=.82;
      window.speechSynthesis.speak(u);
    }
    let chapterSpeechNeedsRestart=false;
    function stopReading(){
      chapterSpeechNeedsRestart=false;
      speechGeneration++;
      if('speechSynthesis' in window)window.speechSynthesis.cancel();
      speaking=false;paused=false;utterances=[];
      $('player').classList.remove('show');
      highlightSpeechParagraph(-1);
    }
    function buildSpeechSegments(){
      const items=[];
      const add=(text,lang,p)=>{
        if(typeof text!=='string'||!text.trim())return;
        // Chinese chunks are split at natural sentence stops; inline English
        // words remain separate to preserve their existing en-US voice.
        const fragments=lang==='zh-CN'?
          (text.match(/[^。！？!?]+[。！？!?]?/gu)||[text]):[text];
        for(const frag of fragments)if(frag.trim())items.push({text:frag,lang,paragraph:p});
      };
      if(activeCloud?.chapterId&&Array.isArray(activeCloud.rawParagraphs)){
        activeCloud.rawParagraphs.forEach((paragraph,index)=>{
          if(typeof paragraph==='string'){add(paragraph,'zh-CN',index);return}
          for(const token of paragraph.segments||[]){
            if(typeof token.text==='string')add(token.text,'zh-CN',index);
            else if(typeof token.surface==='string')add(token.surface,'en-US',index);
          }
        });
      }else{
        CHAPTERS[chapter].parts.forEach((line,index)=>{
          const pieces=line.split(/(\[\[[a-z]+\]\]（[^）]+）)/g).filter(Boolean);
          for(const piece of pieces){
            const match=piece.match(/^\[\[([a-z]+)\]\]（[^）]+）$/);
            add(match?match[1]:piece,match?'en-US':'zh-CN',index);
          }
        });
      }
      return items;
    }
    function seekSpeech(index){
      if(!utterances.length)return;
      speechGeneration++;
      window.speechSynthesis.cancel();
      speaking=true;paused=false;chapterSpeechNeedsRestart=false;
      speakIndex=Math.max(0,Math.min(utterances.length-1,Math.floor(index)));
      $('player').classList.add('show');
      $('playerPause').textContent='Ⅱ';
      speakNext();
    }
    function startReading(fromParagraph=null){
      if(!('speechSynthesis' in window)){toast('此浏览器暂不支持朗读');return}
      if(activeCloud&&!activeCloud.chapterId){toast('请先打开一个可阅读的章节');return}
      const next=buildSpeechSegments();
      if(!next.length){toast('本章没有可朗读的内容');return}
      stopReading();
      utterances=next;speaking=true;paused=false;chapterSpeechNeedsRestart=false;
      let first=0;
      if(Number.isInteger(fromParagraph)){
        const target=utterances.findIndex(t=>t.paragraph>=fromParagraph);
        first=target<0?0:target;
      }else{
        try{first=Math.max(0,Math.min(next.length-1,Number(localStorage.getItem(speechStorageKey()))||0))}
        catch{first=0}
      }
      speakIndex=first;
      $('player').classList.add('show');
      $('playerPause').textContent='Ⅱ';
      $('playerState').textContent='朗读中 · 可拖动调整位置';
      showSpeechPosition(speakIndex);
      speakNext();
    }
    function speakNext(){
      if(!speaking)return;
      if(speakIndex>=utterances.length){
        rememberSpeechPosition(0);stopReading();toast('本章朗读结束');return;
      }
      const current=speakIndex,seg=utterances[speakIndex++];
      const gen=speechGeneration,u=new SpeechSynthesisUtterance(seg.text);
      showSpeechPosition(current);
      highlightSpeechParagraph(seg.paragraph);
      rememberSpeechPosition(current);
      u.lang=seg.lang;u.rate=seg.lang==='en-US'?.86:.94;
      u.onend=()=>{if(speaking&&gen===speechGeneration)speakNext()};
      u.onerror=e=>{if(speaking&&gen===speechGeneration&&e.error!=='interrupted')speakNext()};
      $('playerState').textContent='朗读中 · 第'+(current+1)+'段';
      window.speechSynthesis.speak(u);
    }
    // Desktop-only pointer parallax. All movement is decorative and
    // disabled for touch/keyboard users and when reduced motion is requested.
    function setupHomeSceneMotion(){
      const scene=$('miaowuHomeScene');
      if(!scene||typeof window.matchMedia!=='function'||
         !window.matchMedia('(hover: hover) and (pointer: fine)').matches)return;
      const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
      let frame=0,dx=0,dy=0;
      const apply=()=>{
        frame=0;
        if(!scene.isConnected||reduce.matches)return;
        scene.style.setProperty('--home-shift-x',dx.toFixed(1)+'px');
        scene.style.setProperty('--home-shift-y',dy.toFixed(1)+'px');
      };
      const reset=()=>{
        if(frame){window.cancelAnimationFrame(frame);frame=0}
        scene.style.removeProperty('--home-shift-x');
        scene.style.removeProperty('--home-shift-y');
      };
      scene.addEventListener('pointermove',event=>{
        if(reduce.matches)return;
        const rect=scene.getBoundingClientRect();
        if(!rect.width||!rect.height)return;
        dx=Math.max(-9,Math.min(9,((event.clientX-rect.left)/rect.width-.5)*18));
        dy=Math.max(-5,Math.min(5,((event.clientY-rect.top)/rect.height-.5)*10));
        if(!frame)frame=window.requestAnimationFrame(apply);
      },{passive:true});
      scene.addEventListener('pointerleave',reset);
      scene.addEventListener('pointercancel',reset);
      if(typeof reduce.addEventListener==='function')
        reduce.addEventListener('change',event=>{if(event.matches)reset()});
    }
    setupHomeSceneMotion();
    document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>navigate(el.dataset.nav));$('goHome').onclick=e=>{e.preventDefault();navigate('library')};$('heroRead').onclick=resumeLatestReading;$('heroExplain').onclick=explain;$('readerBack').onclick=()=>navigate('library');
    $('mobileChapterOpen').onclick=()=>{
      $('readerLayout').classList.remove('vocab-drawer-open');
      $('mobileVocabOpen').setAttribute('aria-expanded','false');
      $('readerLayout').classList.add('chapter-drawer-open');
      $('mobileChapterOpen').setAttribute('aria-expanded','true');
    };
    $('mobileChapterClose').onclick=()=>{$('readerLayout').classList.remove('chapter-drawer-open')};
    $('readerDrawerOverlay').onclick=()=>{
      $('readerLayout').classList.remove('chapter-drawer-open','vocab-drawer-open');
      $('mobileChapterOpen').setAttribute('aria-expanded','false');
      $('mobileVocabOpen').setAttribute('aria-expanded','false');
    };$('openActivation').onclick=()=>user?showRedeem():showRegister();$('topAccount').onclick=()=>user?navigate('account'):showLogin();$('wordbookRead').onclick=()=>navigate('library');$('doEcho').onclick=()=>{echoMode='cloud';if(activeCloud?.chapterId)window.MiaowuCloudEcho?.useChapter(activeCloud.chapterId);navigate('echo')};$('smallerFont').onclick=()=>{fontSize=Math.max(12,fontSize-1);applyReadingPrefs()};$('biggerFont').onclick=()=>{fontSize=Math.min(24,fontSize+1);applyReadingPrefs()};$('readerFontSlider').addEventListener('input',e=>{fontSize=Math.max(12,Math.min(24,Math.round(Number(e.target.value)||18)));applyReadingPrefs()});function changeGloss(){gloss=!gloss;$('storyText').classList.toggle('no-gloss',!gloss);$('toggleGloss').classList.toggle('pressed',!gloss);toast(gloss?'已显示释义':'已隐藏释义，可以尝试回忆')}$('toggleGloss').onclick=changeGloss;$('sideToggleGloss').onclick=changeGloss;$('toggleNight').onclick=flipTheme;$('globalThemeToggle').onclick=flipTheme;$('sideRead').onclick=startReading;$('topRead').onclick=startReading;$('playerPause').onclick=()=>{if(!speaking)return;if(paused){if(chapterSpeechNeedsRestart)seekSpeech(Math.max(0,speakIndex-1));else{window.speechSynthesis.resume();paused=false;$('playerPause').textContent='Ⅱ';$('playerState').textContent='继续朗读'}}else{window.speechSynthesis.pause();paused=true;$('playerPause').textContent='▶';$('playerState').textContent='已暂停'}};$('playerStop').onclick=()=>{rememberSpeechPosition(0);stopReading()};
    $('playerPrevious').onclick=()=>{if(speaking)seekSpeech(speakIndex-2);else startReading()};
    $('playerNext').onclick=()=>{if(speaking)seekSpeech(speakIndex);else startReading()};
    $('playerSeek').addEventListener('input',e=>{
      $('playerPosition').textContent=(Number(e.target.value)+1)+' / '+utterances.length+' 段';
    });
    $('playerSeek').addEventListener('change',e=>{
      if(speaking)seekSpeech(Number(e.target.value));
      // Never start chapter audio from a slider unless user pressed 朗读 first.
    });
    $('storyText').addEventListener('click',e=>{
      const word=e.target.closest('[data-cloud-word]');
      if(word){
        e.preventDefault();e.stopPropagation();
        if(speaking&&!paused){
          window.speechSynthesis.pause();
          paused=true;
          $('playerPause').textContent='▶';
          $('playerState').textContent='已暂停 · 点击继续朗读';
        }
        showCloudWord(word.dataset.cloudWord,word);
        window.MiaowuOnboarding?.wordTapped();
        return;
      }
      if(e.target.closest('button,a,[role=button]'))return;
      const p=e.target.closest('[data-audio-paragraph]');
      if(!activeCloud?.chapterId||!p||!speaking)return;
      const paragraph=Number(p.dataset.audioParagraph);
      const current=utterances[Math.max(0,speakIndex-1)]?.paragraph;
      if(paragraph===current){
        if(paused){
          if(chapterSpeechNeedsRestart)seekSpeech(Math.max(0,speakIndex-1));
          else {window.speechSynthesis.resume();paused=false;$('playerPause').textContent='Ⅱ';$('playerState').textContent='继续朗读';}
        }else{
          window.speechSynthesis.pause();paused=true;$('playerPause').textContent='▶';$('playerState').textContent='已暂停';
        }
      }else{
        const segment=utterances.findIndex(x=>x.paragraph>=paragraph);
        if(segment>=0)seekSpeech(segment);
      }
    });
$('wordBackdrop').onclick=closeWord;$('modalClose').onclick=closeModal;$('modalOverlay').onclick=e=>{if(e.target===$('modalOverlay'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeWord()}});document.querySelectorAll('[data-word-filter]').forEach(el=>el.onclick=()=>{wordFilter=el.dataset.wordFilter;renderWords()});
    // Cloud reading progress is saved automatically on scroll and chapter navigation.
    window.MiaowuChapterWords?.configure({
      request:serverRequest,refresh:refreshCloudLearning,
      user:()=>!!user,login:showLogin,toast,speak:speakWord,showWord:showCloudWord
    });
    window.MiaowuCloudEcho?.configure({
      request:serverRequest,refresh:refreshCloudLearning,progress:()=>cloudProgress,
      showModal,closeModal,navigate,toast,speak:speakWord
    });
    window.MiaowuFlashcards?.configure({
      request:serverRequest,refresh:refreshCloudLearning,speak:speakWord,toast,
      user:()=>user?.name||null,
      saved:()=>cloudSaved.size,due:()=>cloudFlashDue,
      login:showLogin
    });
    window.MiaowuOnboardingNavigate=navigate;
    window.MiaowuOnboardingRedeem=showRedeem;
    applyTheme();applyReadingPrefs();renderLibrary();renderReminder();renderWords();renderQuiz();renderAccount();initialSessionPromise=loadServerSession();refreshCloudCategories();
  })();
  