// Gigs › Rekordbox: the Rekordbox-backed workspace. Imported baselines and
// publication are independent. Playlists are made in Unified (Collection ›
// Playlists); here a node can be copied to Unified, not duplicated.
import { bulkActionChanges, bulkOrder, playlistBulkActionsHtml, wirePlaylistBulkActions } from './playlist-bulk.js';
import { escapeHtml as esc } from './html.js';

const memberKey = (member) => member?.trackId
    ? `track:${member.trackId}`
    : `source:${member?.snapshotId || ''}:${member?.key || ''}:${member?.path || ''}`;
export async function workspaceApi(path, body) {
    const res = await fetch(`/api/playlists/${path}`, body === undefined ? {} : body instanceof FormData ? { method:'POST',body } : { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Workspace request failed');
    return data;
}
export function workspaceDialog(title, html, submit = 'Continue') {
    return new Promise(resolve => {
        const previous = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.className = 'playlist-dialog';
        dialog.setAttribute('aria-label', title);
        dialog.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${html}<p class="playlist-actions"><button value="cancel" formnovalidate class="btn btn-secondary">Cancel</button><button value="confirm" class="btn">${esc(submit)}</button></p></form>`;
        document.body.append(dialog);
        dialog.addEventListener('close',()=>{ const value = dialog.returnValue === 'confirm' ? new FormData(dialog.querySelector('form')) : null; dialog.remove(); previous?.isConnected && previous.focus(); resolve(value); },{once:true});
        dialog.showModal();
    });
}
/** What the one-time move of app-made drafts into Unified did (the playlists migration). Empty when it moved nothing. */
export function migrationLogHtml(log) {
    if (!log || (!log.moved?.length && !log.stayed?.length)) return '';
    const moved = (log.moved || []).map(m => `<li><a href="#/playlists/u/${encodeURIComponent(m.recordId)}">${esc(m.name)}</a> · ${m.as === 'gig' ? 'now a gig' : 'now a playlist'}</li>`).join('');
    const stayed = (log.stayed || []).map(m => `<li><button type="button" class="link-chip chip-sm" data-node="${esc(m.nodeId)}">${esc(m.name)}</button> · ${esc(m.reason)}</li>`).join('');
    return `<details class="playlist-history"><summary>Moved to Unified (${(log.moved || []).length}) · stayed here (${(log.stayed || []).length})</summary>${moved ? `<h3>Moved</h3><ul>${moved}</ul>` : ''}${stayed ? `<h3>Stayed</h3><ul>${stayed}</ul>` : ''}</details>`;
}
const treeSummary = n => n.children ? `<li>${esc(n.name)}<ul>${n.children.map(treeSummary).join('')}</ul></li>` : `<li>${esc(n.name)} · ${(n.tracks || n.members || []).length} tracks</li>`;
export function publicationOptionsHtml(kind, gig) {
    return `<p>Publish an independent XML copy. Import it inside Rekordbox to accept it.</p><label>Copy name<input name="name" required value="${esc((gig?.name || 'Playlist') + ' — Unified')}"></label>${kind === 'gig' ? `<label>Output<select name="format"><option value="folder">Folder of selected playlists</option><option value="single">One playlist, duplicates removed</option></select></label><fieldset><legend>Include playlists</legend>${gig.playlists.map((p,i)=>`<label><input type="checkbox" name="lane" value="${i}" ${p.isBpmRoll ? '' : 'checked'}>${esc(p.name)}${p.isBpmRoll ? ' (derived, static copy)' : ''}</label>`).join('')}</fieldset>` : ''}`;
}
export async function publishWorkspace(app, kind, id, gig) {
    try {
        const options = await workspaceDialog('Publish to Rekordbox', publicationOptionsHtml(kind, gig), 'Preview');
        if (!options) return;
        const preview = await workspaceApi('publish/preview',{kind,id,name:options.get('name'),...(kind==='gig' ? {flatten:options.get('format')==='single', lanes:options.getAll('lane').map(Number),includeDerived:true} : {})});
        if (!preview.compatibilityVerified) {
            await workspaceDialog('Publication acceptance check pending', '<p>Importing and editing drafts are available. The new publisher is gated until its XML behavior is checked in a disposable library on your installed Rekordbox version. Your existing handoff stays intact.</p><p>Setup instructions: docs/REKORDBOX-WORKFLOW.md</p>', 'Done');
            return;
        }
        const accept = await workspaceDialog('Review publication', `<ul>${treeSummary(preview.tree)}</ul><p>${preview.count} available tracks. ${esc(preview.message)}</p>${preview.omissions.length ? `<details open><summary>${preview.omissions.length} omissions</summary><ul>${preview.omissions.map(o=>`<li>${esc(o.playlist)} · ${esc(o.name)}: ${esc(o.reason)}</li>`).join('')}</ul></details><label><input type="checkbox" name="partial" required>Publish available tracks only; I reviewed every omission.</label>` : ''}`, 'Publish XML');
        if (!accept) return;
        const result = await workspaceApi('publish/commit',{token:preview.token,allowOmissions:accept.has('partial')});
        await workspaceDialog('Available in XML', `<p>Handoff: <code>${esc(result.path)}</code></p><p>In Rekordbox, refresh its XML source, then import the published copy from the Playlists or Gigs folder. Native playlist replacement remains a separate Rekordbox action.</p><p>This does not confirm native import, cues, grids, or USB export.</p>`, 'Done');
    } catch(e) { app.showNotification(e.message,'error'); }
}
export async function renderPlaylistsWorkspace(host, app) {
    document.getElementById('viewTitle').textContent = 'Rekordbox';
    document.getElementById('viewSubtitle').textContent = 'Imported playlists and publications';
    let selected = app._route?.node || app._playlistNodeId || null;
    let generation = 0;
    let displaySort = 'manual', query = '';
    let selectedMembers = new Set(), lastSelected = null;
    async function render() {
        const request = ++generation;
        const state = await workspaceApi('workspace');
        if (request !== generation || app.currentView !== 'rekordbox') return;
        const nodes = state.nodes;
        const chosen = nodes.find(n=>n.id===selected);
        const detail = chosen ? await workspaceApi(`node/${encodeURIComponent(chosen.id)}`) : null;
        if (request !== generation || app.currentView !== 'rekordbox') return;
        selectedMembers = new Set([...selectedMembers].filter((index) => Number.isInteger(index) && index >= 0 && index < (detail?.members?.length || 0)));
        function tree(parent = null, depth = 0) {
            if (depth > 64) return '';
            return nodes.filter(n=>n.parent===parent).sort((a,b)=>a.position-b.position).map(n=>`<li><button class="playlist-tree-node ${n.id===selected ? 'is-selected' : ''}" data-node="${esc(n.id)}" ${n.id===selected ? 'aria-current="true"' : ''}>${n.kind==='folder' ? '▸' : '♫'} ${esc(n.name)}${n.missing ? ' · Missing' : ''}</button>${n.kind==='folder' ? `<ul>${tree(n.id,depth+1)}</ul>` : ''}</li>`).join('');
        }
        const visible = (detail?.members || []).map((m,i)=>({m,i,t:detail.tracks[i]})).filter(({t})=>`${t?.name || t?.title || ''} ${t?.artist || ''}`.toLowerCase().includes(query.toLowerCase()));
        if (displaySort !== 'manual') visible.sort((a,b)=>String(displaySort === 'artist' ? a.t?.artist : a.t?.name || a.t?.title).localeCompare(String(displaySort === 'artist' ? b.t?.artist : b.t?.name || b.t?.title)));
        const latest = chosen && state.snapshots.find(s=>s.id===chosen.snapshotId);
        host.innerHTML = `<section class="playlist-workspace"><header><div><h1>Rekordbox</h1><p class="muted">Rekordbox is the source of truth. Make playlists in Collection › Playlists.</p></div><div class="playlist-actions"><button class="btn" data-import>Import Rekordbox XML</button></div></header><div class="playlist-layout"><nav aria-label="Playlist folders"><ul>${tree() || '<li>No imported playlists yet.</li>'}</ul></nav><section class="playlist-detail">${detail ? `<h2>${esc(detail.name)}</h2><p role="status">${esc(detail.status)} · Revision ${detail.revision}</p>${latest ? `<p class="muted">From ${esc(latest.filename)}, imported ${esc(new Date(latest.importedAt).toLocaleString())}<br>Snapshot ${esc(latest.hash.slice(0,12))}</p>` : '<p class="muted">Draft made here, kept back: some tracks aren’t in Collection</p>'}<div class="playlist-actions"><button class="btn" data-publish>Publish to Rekordbox…</button><button class="btn btn-secondary" data-edit>Rename / move</button><button class="btn btn-secondary" data-copy-unified>Copy to Unified</button><button class="btn btn-secondary" data-gig>Start gig from this ${detail.kind}</button>${detail.baseline ? '<button class="btn btn-secondary" data-compare>Compare / revert</button><button class="btn btn-secondary" data-keep>Keep Unified draft</button>' : ''}${detail.history.length ? '<button class="btn btn-secondary" data-undo>Restore earlier revision…</button>' : ''}</div>${detail.kind==='playlist' ? `<div class="playlist-actions"><label>Find tracks <input data-track-query value="${esc(query)}" type="search"></label><label>Display order <select class="filter-select" data-display-sort><option value="manual">Manual order</option><option value="title" ${displaySort==='title'?'selected':''}>Title</option><option value="artist" ${displaySort==='artist'?'selected':''}>Artist</option></select></label><button class="btn btn-secondary" data-use-order ${displaySort==='manual'||query?'disabled':''}>Use this order</button></div><p class="muted">${visible.length} of ${detail.members.length} tracks</p><div class="selection-bar workspace-playlist-selection" data-workspace-selection${selectedMembers.size?'':' hidden'}><span class="selection-count" data-workspace-selection-count role="status">${selectedMembers.size} selected</span><div class="selection-bar-actions">${playlistBulkActionsHtml({allowTransfer:nodes.some(n=>n.kind==='playlist'&&!n.missing&&n.id!==detail.id)})}<button type="button" class="selection-clear-btn" data-workspace-selection-clear>Clear</button></div></div><div class="playlist-track-scroll"><table class="library-table"><thead><tr><th class="col-select" aria-label="Select"></th><th>#</th><th>Title</th><th>Artist</th><th>Order / membership</th></tr></thead><tbody>${visible.map(({m,i})=>`<tr data-member-index="${i}" class="library-table-row${selectedMembers.has(i)?' row-selected':''}" aria-selected="${selectedMembers.has(i)}" tabindex="0" draggable="${displaySort==='manual'&&!query}"><td class="col-select"><input type="checkbox" data-workspace-member-select aria-label="Select track ${i+1}" ${selectedMembers.has(i)?'checked':''}></td><td>${i+1}</td><td>${esc(detail.tracks[i]?.name || detail.tracks[i]?.title || 'Unresolved track')}</td><td>${esc(detail.tracks[i]?.artist)}</td><td><button class="btn btn-sm" data-up="${i}" ${i===0||displaySort!=='manual'||query?'disabled':''} aria-label="Move track ${i+1} up">↑</button><button class="btn btn-sm" data-down="${i}" ${i===detail.members.length-1||displaySort!=='manual'||query?'disabled':''} aria-label="Move track ${i+1} down">↓</button><button class="btn btn-sm btn-secondary" data-remove="${i}">Remove</button><button class="btn btn-sm btn-secondary" data-inspect="${i}">Details</button></td></tr>`).join('')}</tbody></table></div>` : '<p>Select a playlist in this folder to edit its ordered membership.</p>'}` : `<div class="empty-state"><h2>Your Rekordbox playlists, with room to work</h2><p>Import an XML snapshot to preserve its folders and track order. Gigs remain independent preparation workspaces.</p></div>`}</section></div>${migrationLogHtml(state.migrationLog)}<details class="playlist-history"><summary>Publication history (${state.publications.length})</summary>${state.publications.slice().reverse().map(p=>`<article><strong>${esc(p.tree.name)}</strong> · ${p.active?'Current XML copy':'Historical copy'} · ${esc(p.delivery)} · ${esc(new Date(p.createdAt).toLocaleString())}<p>${esc(p.hash.slice(0,12))} · ${esc(p.path || '')}</p>${p.state==='committed' ? `<button class="btn btn-sm btn-secondary" data-ack="${esc(p.id)}">I imported this in Rekordbox</button><button class="btn btn-sm btn-secondary" data-verify="${esc(p.id)}">Verify against later XML…</button><button class="btn btn-sm btn-secondary" data-withdraw="${esc(p.id)}">Withdraw from XML…</button>` : ''}<button class="btn btn-sm btn-secondary" data-republish="${esc(p.id)}">Restore this publication…</button></article>`).join('') || '<p>Nothing published yet.</p>'}</details><footer><p>Verified recovery checkpoint: ${esc(new Date(state.backup.createdAt).toLocaleString())} · ${esc(state.backup.integrity)}</p><button class="btn btn-secondary" data-backup>Back up now</button></footer></section>`;
        function on(selector,fn) { host.querySelectorAll(selector).forEach(el=>el.addEventListener('click',async()=>{ el.disabled=true; try { await fn(el); } catch(e) { app.showNotification(e.message,'error'); } finally { if(el.isConnected) el.disabled=false; } })); }
        const memberRows = [...host.querySelectorAll('[data-member-index]')];
        const syncMemberSelection = () => {
            for (const row of memberRows) {
                const index = Number(row.dataset.memberIndex), selected = selectedMembers.has(index);
                row.classList.toggle('row-selected', selected);
                row.setAttribute('aria-selected', String(selected));
                const input = row.querySelector('[data-workspace-member-select]');
                if (input) input.checked = selected;
            }
            const bar = host.querySelector('[data-workspace-selection]');
            const count = bar?.querySelector('[data-workspace-selection-count]');
            if (count) count.textContent = `${selectedMembers.size} selected`;
            if (selectedMembers.size) bar?.removeAttribute('hidden'); else bar?.setAttribute('hidden','');
        };
        const selectMember = (row,{shift=false,toggle=false}={}) => {
            const position = memberRows.indexOf(row), index = Number(row?.dataset.memberIndex);
            if (position < 0 || !Number.isInteger(index)) return;
            if (shift && lastSelected != null) {
                const lastPosition = memberRows.findIndex((candidate) => Number(candidate.dataset.memberIndex) === lastSelected);
                if (lastPosition >= 0) {
                    const [lo,hi] = position < lastPosition ? [position,lastPosition] : [lastPosition,position];
                    const add = !selectedMembers.has(index);
                    for(let i=lo;i<=hi;i+=1){const at=Number(memberRows[i].dataset.memberIndex);if(add)selectedMembers.add(at);else selectedMembers.delete(at);}
                }
            } else if (toggle) {
                if(selectedMembers.has(index))selectedMembers.delete(index);else selectedMembers.add(index);
                lastSelected=index;
            } else { selectedMembers=new Set([index]); lastSelected=index; }
            syncMemberSelection();
        };
        host.querySelector('[data-workspace-selection-clear]')?.addEventListener('click',()=>{selectedMembers.clear();lastSelected=null;syncMemberSelection();});
        host.querySelector('.playlist-track-scroll tbody')?.addEventListener('click',(event)=>{
            const row=event.target.closest('[data-member-index]');if(!row)return;
            if(event.target.closest('[data-workspace-member-select]')){event.stopPropagation();selectMember(row,{shift:event.shiftKey,toggle:true});return;}
            if(event.target.closest('button,a,input,select'))return;
            selectMember(row,{shift:event.shiftKey,toggle:event.metaKey||event.ctrlKey});
        });
        host.querySelector('.playlist-track-scroll tbody')?.addEventListener('keydown',(event)=>{
            const row=event.target.closest('[data-member-index]');if(!row||event.target!==row)return;
            if(event.key===' '){event.preventDefault();selectMember(row,{shift:event.shiftKey,toggle:true});}
            else if(event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)){
                event.preventDefault();const at=memberRows.indexOf(row),next=Math.max(0,Math.min(memberRows.length-1,at+(event.key==='ArrowDown'?1:-1)));
                selectMember(memberRows[next],{shift:true});memberRows[next]?.focus();
            }
        });
        host.querySelector('.playlist-detail')?.addEventListener('keydown',(event)=>{
            if(event.key!=='Escape'||!selectedMembers.size)return;
            event.preventDefault();event.stopPropagation();selectedMembers.clear();lastSelected=null;syncMemberSelection();
        });
        wirePlaylistBulkActions(host.querySelector('[data-workspace-selection]'),{
            ids:()=>[...selectedMembers].map(String),
            run:async(action,ids)=>{
                const order=detail.members.map((_,index)=>String(index));
                if(!bulkActionChanges(order,ids,action))return;
                const members=bulkOrder(order,ids,action).map((index)=>detail.members[Number(index)]);
                await workspaceApi('edit',{id:detail.id,revision:detail.revision,members});
                selectedMembers.clear();lastSelected=null;await render();
            },
            transfer:async(move,ids)=>{
                const targets=nodes.filter((node)=>node.kind==='playlist'&&!node.missing&&node.id!==detail.id);
                if(!targets.length){app.showNotification('Make another playlist first.','info');return;}
                const input=await workspaceDialog(move?'Move to playlist…':'Copy to playlist…',`<label>Playlist<select name="target">${targets.map((node)=>`<option value="${esc(node.id)}">${esc(node.name)}</option>`).join('')}</select></label>`,move?'Move':'Copy');
                if(!input)return;
                const target=await workspaceApi(`node/${encodeURIComponent(input.get('target'))}`);
                const chosen=new Set(ids.map(Number));
                const picked=detail.members.filter((_,index)=>chosen.has(index));
                const have=new Set(target.members.map(memberKey));
                const fresh=picked.filter((member)=>!have.has(memberKey(member)));
                const targetMembers=[...target.members,...fresh];
                if(targetMembers.length>100000)throw new Error('Playlist is too large to edit.');
                if(fresh.length)await workspaceApi('edit',{id:target.id,revision:target.revision,members:targetMembers});
                if(move){
                    try{
                        await workspaceApi('edit',{id:detail.id,revision:detail.revision,members:detail.members.filter((_,index)=>!chosen.has(index))});
                    }catch(error){app.showNotification('Moved, but could not remove from the original playlist — retry','error');await render();return;}
                }
                selectedMembers.clear();lastSelected=null;
                app.showNotification(`${move?'Moved':'Copied'} ${picked.length} ${picked.length===1?'track':'tracks'} to ${target.name}`,'success');
                await render();
            },
            onError:async(error)=>{
                selectedMembers.clear();lastSelected=null;
                app.showNotification(error.message,'error');await render();
            },
        });
        host.querySelector('[data-track-query]')?.addEventListener('change',async e=>{selectedMembers.clear();lastSelected=null;query=e.target.value;await render();});
        host.querySelector('[data-display-sort]')?.addEventListener('change',async e=>{selectedMembers.clear();lastSelected=null;displaySort=e.target.value;await render();});
        host.querySelectorAll('[data-member-index][draggable="true"]').forEach(row=>{
            row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',row.dataset.memberIndex);});
            row.addEventListener('dragover',e=>e.preventDefault());
            row.addEventListener('drop',async e=>{
                e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain')),to=Number(row.dataset.memberIndex);
                if(!Number.isInteger(from)||from<0||from>=detail.members.length||from===to)return;
                const members=[...detail.members];members.splice(to,0,members.splice(from,1)[0]);
                try{await workspaceApi('edit',{id:detail.id,revision:detail.revision,members});await render();}catch(error){app.showNotification(error.message,'error');}
            });
        });
        on('[data-use-order]',async()=>{await workspaceApi('edit',{id:detail.id,revision:detail.revision,members:visible.map(v=>v.m)});displaySort='manual';await render();});
        on('[data-inspect]',async el=>{const t=detail.tracks[Number(el.dataset.inspect)];if(t) await app.inspector.open({...t,id:t.id||t.libraryTrackId,title:t.title||t.name,local_path:t.local_path||t.localPath},el);});
        on('[data-node]', async el=>{ selectedMembers.clear();lastSelected=null;selected=el.dataset.node; app._playlistNodeId=selected; app._syncRoute?.({ node: selected }, { replace: true }); await render(); });
        on('[data-import]',async()=>{
            const input = await workspaceDialog('Import Rekordbox snapshot', `<label>XML export<input type="file" name="file" accept=".xml" required></label><label>Source library<select name="sourceId"><option value="">New source library</option>${state.sources.map(s=>`<option value="${esc(s.id)}" ${state.sources.length===1?'selected':''}>${esc(s.label)}</option>`).join('')}</select></label><label>New source label<input name="label" value="My Rekordbox library"></label><p>Importing will not change gigs, audio files, or the handoff XML.</p>`,'Preview import');
            if(!input) return;
            const preview=await workspaceApi('import/preview',input);
            if(preview.duplicate) { app.showNotification('This exact snapshot was already imported.','info');return; }
            const confirm=await workspaceDialog('Review source snapshot',`<p>${preview.tracks} tracks · ${esc(preview.source)}</p><p>${esc(preview.notice)}</p><details open><summary>Source changes (${preview.changes.length})</summary><ul>${preview.changes.map(c=>`<li>${esc(c.name)}: ${esc(c.change)}${c.localDraft?' · local draft retained':''}</li>`).join('')}</ul></details><ul>${preview.tree.map(treeSummary).join('')}</ul>${preview.unsupported.length ? `<p>Preserved in source XML, not editable here: ${esc(preview.unsupported.join(', '))}.</p>`:''}<label><input type="checkbox" required>I reviewed this snapshot and want to accept it as the observed Rekordbox baseline.</label>`,'Accept snapshot');
            if(confirm) {
                const committed=await workspaceApi('import/commit',{token:preview.token});
                const reconciled=committed.pendingReconciliation;
                if(reconciled?.confirmed) app.showNotification(`${reconciled.confirmed} pending ${reconciled.confirmed===1?'track':'tracks'} confirmed in Rekordbox.`,'success');
                app._invalidateTracks?.();
                await render();
            }
        });
        on('[data-edit]',async()=>{
            const input=await workspaceDialog('Rename or move draft',`<label>Name<input name="name" required value="${esc(detail.name)}"></label><label>Folder<select name="parent"><option value="">Top level</option>${nodes.filter(n=>n.kind==='folder' && n.id!==detail.id).map(n=>`<option value="${esc(n.id)}" ${n.id===detail.parent?'selected':''}>${esc(n.name)}</option>`).join('')}</select></label>`,'Save revision');
            if(input) {await workspaceApi('edit',{id:detail.id,revision:detail.revision,name:input.get('name'),parent:input.get('parent')||null});await render();}
        });
        on('[data-up],[data-down],[data-remove]',async el=>{
            const members=[...detail.members];
            if(el.dataset.remove!==undefined) members.splice(Number(el.dataset.remove),1);
            else {const i=Number(el.dataset.up ?? el.dataset.down), j=i+(el.dataset.up!==undefined?-1:1); [members[i],members[j]]=[members[j],members[i]];}
            await workspaceApi('edit',{id:detail.id,revision:detail.revision,members});await render();
        });
        on('[data-compare]',async()=>{
            const input=await workspaceDialog('Compare with imported XML',`<p>Imported: ${esc(detail.baseline.name)} · ${detail.baseline.members.length} members</p><p>Working: ${esc(detail.name)} · ${detail.members.length} members</p><details><summary>Exact imported and working order</summary><h3>Imported order</h3><ol>${detail.baselineTracks.map(t=>`<li>${esc(t?.artist)} — ${esc(t?.name || t?.title || 'Unresolved member')}</li>`).join('')}</ol><h3>Working order</h3><ol>${detail.tracks.map(t=>`<li>${esc(t?.artist)} — ${esc(t?.name || t?.title || 'Unresolved member')}</li>`).join('')}</ol></details><p>Reverting restores the imported name, folder and order. This working revision remains in history.</p>`,'Use Rekordbox baseline');
            if(input) {await workspaceApi('edit',{id:detail.id,revision:detail.revision,action:'revert'});await render();}
        });
        on('[data-keep]',async()=>{
            const input=await workspaceDialog('Keep Unified draft','<p>Keep this working proposal against the latest imported baseline. Rekordbox remains authoritative. Publication is a separate action.</p>','Keep draft');
            if(input) {await workspaceApi('edit',{id:detail.id,revision:detail.revision,action:'keep-draft'});await render();}
        });
        on('[data-verify]',async el=>{
            const imported=nodes.filter(n=>n.baseline && !n.missing);
            const input=await workspaceDialog('Verify against a later XML',`<label>Imported node representing this publication<select name="id">${imported.map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('')}</select></label><p>This compares imported names and ordered file paths. It does not verify cues, grids or USBs.</p>`,'Compare');
            if(input){await workspaceApi('publication/verify',{publicationId:el.dataset.verify,nodeId:input.get('id')});await render();}
        });
        on('[data-republish],[data-withdraw]',async el=>{
            const withdraw=!!el.dataset.withdraw;
            const preview=await workspaceApi('publish/preview',{historyId:el.dataset.withdraw || el.dataset.republish,withdraw});
            const input=await workspaceDialog(withdraw?'Withdraw from handoff':'Restore previous publication',`<ul>${treeSummary(preview.tree)}</ul><p>${withdraw?'Removes this copy from generated XML only. Native Rekordbox playlists stay unchanged.':'Publishes this historical revision. Working drafts stay unchanged.'}</p>${preview.omissions.length ? `<ul>${preview.omissions.map(o=>`<li>${esc(o.name)}: ${esc(o.reason)}</li>`).join('')}</ul><label><input type="checkbox" name="partial" required>Accept all listed omissions</label>`:''}`,'Update XML');
            if(input){await workspaceApi('publish/commit',{token:preview.token,allowOmissions:input.has('partial')});await render();}
        });
        on('[data-undo]',async()=>{const input=await workspaceDialog('Restore an earlier working revision',`<label>Revision<select name="historyId">${detail.history.slice().reverse().map(h=>`<option value="${esc(h.id)}">${h.revision} · ${esc(h.name)} · ${esc(new Date(h.createdAt).toLocaleString())}</option>`).join('')}</select></label>`,'Restore revision');if(input){await workspaceApi(`node/${detail.id}/undo`,{revision:detail.revision,historyId:input.get('historyId')});await render();}});
        on('[data-copy-unified]',async()=>{
            const out=await workspaceApi(`node/${encodeURIComponent(detail.id)}/copy-to-unified`,{use:'members'});
            app.showNotification(`Copied to Unified${out.unresolved?` · ${out.unresolved} not in Collection, left out`:''}`,'success');
            app.navigate({view:'playlists',kind:'u',id:out.record.id});
        });
        on('[data-gig]',async()=>{const input=await workspaceDialog('Start an independent gig','<p>This copies the current playlist membership once. Later XML imports will not change this gig.</p>','Create gig');if(input){const gig=await workspaceApi(`node/${detail.id}/gig`,{});app.navigate({view:'gigs',id:gig.id});}});
        on('[data-publish]',async()=>{await publishWorkspace(app,'playlist',detail.id,{name:detail.name});await render();});
        on('[data-ack]',async el=>{await workspaceApi(`publication/${el.dataset.ack}/acknowledge`,{});await render();});
        on('[data-backup]',async()=>{await workspaceApi('backup',{});await render();});
    }
    await render();
}
