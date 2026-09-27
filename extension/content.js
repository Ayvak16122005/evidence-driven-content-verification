chrome.runtime.onMessage.addListener((m,s,send)=>{if(m?.type==="GET_PAGE_DATA")send({title:document.title,url:location.href,text:(document.body?.innerText||"").slice(0,25000)});return true;});
