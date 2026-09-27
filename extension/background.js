chrome.runtime.onInstalled.addListener(()=>chrome.contextMenus.create({id:"mailon",title:"Ask Mailon to verify selected text",contexts:["selection"]}));
chrome.contextMenus.onClicked.addListener(info=>{if(info.menuItemId==="mailon"){chrome.storage.local.set({mailonSelection:info.selectionText||""});}});
chrome.action.onClicked.addListener(tab=>{if(tab?.windowId)chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});});
