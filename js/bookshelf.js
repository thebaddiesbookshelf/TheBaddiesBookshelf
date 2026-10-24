
import { db, requireAccess, logout } from './auth.js';

const $ = id => document.getElementById(id);

const themes = {
  romi: {accent:'#ff4da6',light:'#ffb5da',bg:'#130d17',surface:'#241727',alt:'#332036',border:'#65415d',label:'💗 Romi Era'},
  nyx: {accent:'#ff319d',light:'#ffa0d5',bg:'#09090d',surface:'#1b1520',alt:'#302034',border:'#63365e',label:'🖤 Nyx Era'},
  nova: {accent:'#b77cff',light:'#ddbdff',bg:'#120d23',surface:'#241a3c',alt:'#362650',border:'#665087',label:'🔮 Nova Era'},
  sage: {accent:'#c99b69',light:'#f1cba0',bg:'#17120e',surface:'#30251e',alt:'#46362a',border:'#79604a',label:'🍂 Sage Era'},
  scarlet: {accent:'#f34a65',light:'#ffabb7',bg:'#180c12',surface:'#30171f',alt:'#47232c',border:'#85414e',label:'❤️ Scarlett Era'}
};

const statuses = {
  want_to_read:'💗 Want to Read',
  currently_reading:'📖 Currently Reading',
  finished:'✨ Finished',
  on_hold:'⏸️ On Hold',
  dnf:'💔 DNF'
};

const entryCols =
  'id,user_id,book_id,community_book_id,reading_status,book_format,total_pages,current_page,rating,started_at,finished_at';

const officialCols = 'id,title,author,cover_url,is_archived';
const communityCols =
  'id,title,author,cover_url,is_archived,series_name,book_number';

let user = null;
let entries = [];
let catalog = new Map();
let results = [];
let searchBusy = false;
let submitBusy = false;
let editBusy = false;
let addBusy = false;

// CUSTOM SHELVES™
let shelves = [];
let shelfAssignments = [];
let activeShelfId = null;
let shelfBusy = false;
let assignmentBusy = false;

// CUSTOM SHELF COVERS™
const SHELF_COVER_BUCKET = 'tbb-shelf-covers';
const SHELF_COVER_MAX_BYTES = 5 * 1024 * 1024;
const SHELF_COVER_TYPES = {
  'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp'
};
let coverPreviewObjectUrl = null;
let removeExistingCover = false;

const key = (source,id) => `${source}:${id}`;

const entryKey = e => key(
  e.community_book_id ? 'community' : 'official',
  e.community_book_id || e.book_id
);

const element = (tag,cls='',txt) => {
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(txt !== undefined) n.textContent = txt;
  return n;
};

function notify(text,err=false) {
  const n = $('message');
  if(!n) return;
  n.textContent = text;
  n.className = err ? 'bookshelf-notice error' : 'bookshelf-notice';
}

function empty(target,text) {
  target.replaceChildren(
    element('div','library-empty-message',text)
  );
}

function theme(name) {
  const t = themes[name === 'scarlett' ? 'scarlet' : name] || themes.romi;
  for(const k of ['accent','light','bg','surface','alt','border']) {
    document.documentElement.style.setProperty(`--${k}`,t[k]);
  }
  $('bookshelfTheme').textContent = t.label;
}

async function owner() {
  const {data,error} = await db.from('tbb_profiles')
    .select('display_name,username,vanity_theme')
    .eq('user_id',user.id)
    .maybeSingle();

  if(error) throw error;
  if(!data) throw Error('Your Library Card was not found.');

  $('bookshelfOwner').textContent =
    `📚 ${data.display_name || data.username || 'Baddie'}'s Bookshelf`;

  theme(data.vanity_theme);
}

async function count(table,status) {
  let q = db.from(table)
    .select('id',{count:'exact',head:true})
    .eq('user_id',user.id);

  if(status) q = q.eq('reading_status',status);

  const {count,error} = await q;
  if(error) throw error;
  return count ?? 0;
}

async function stats() {
  const [total,reading,finished,shelvesCount] = await Promise.all([
    count('tbb_bookshelf_entries'),
    count('tbb_bookshelf_entries','currently_reading'),
    count('tbb_bookshelf_entries','finished'),
    count('tbb_custom_shelves')
  ]);

  $('totalBooks').textContent = total;
  $('currentlyReading').textContent = reading;
  $('finishedBooks').textContent = finished;
  $('customShelfCount').textContent = shelvesCount;
}

async function fetchBooks(source,ids) {
  const missing = [...new Set(ids.filter(Boolean))]
    .filter(id => !catalog.has(key(source,id)));

  const table = source === 'official'
    ? 'tbb_books'
    : 'tbb_community_books';

  for(let i=0;i<missing.length;i+=100) {
    const {data,error} = await db.from(table)
      .select(source === 'official' ? officialCols : communityCols)
      .in('id',missing.slice(i,i+100));

    if(error) throw error;

    for(const b of data || []) {
      catalog.set(key(source,b.id),{...b,source});
    }
  }
}

async function loadCollection() {
  const all = [];

  for(let from=0;;from+=500) {
    const {data,error} = await db.from('tbb_bookshelf_entries')
      .select(entryCols)
      .eq('user_id',user.id)
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .range(from,from+499);

    if(error) throw error;

    all.push(...(data || []));
    if(!data || data.length < 500) break;
  }

  entries = all;

  await Promise.all([
    fetchBooks('official',entries.map(e=>e.book_id)),
    fetchBooks('community',entries.map(e=>e.community_book_id))
  ]);

  renderCollection();
  renderResults();

  if(activeShelfId) renderShelfDetail();
  if($('shelfBooksDialog')?.open) renderShelfChoices();
}

function coverUrl(value) {
  if(!value) return null;
  try {
    const u = new URL(value,location.href);
    return ['https:','http:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function bookForEntry(e) {
  return catalog.get(entryKey(e)) || {
    id:e.community_book_id || e.book_id,
    title:'Catalog Book Unavailable',
    author:'Reading record retained',
    source:e.community_book_id ? 'community' : 'official'
  };
}

function card(book,entry=null) {
  const c = element('article','library-book-card');
  const cover = element('div','library-book-cover');
  const fallback = element(
    'div','library-cover-fallback',
    `📚 ${book.title || 'Untitled'}`
  );

  const url = coverUrl(book.cover_url);

  if(url) {
    const img = element('img');
    img.src = url;
    img.alt = `Cover of ${book.title}`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error',()=>img.replaceWith(fallback));
    cover.append(img);
  } else {
    cover.append(fallback);
  }

  c.append(cover);

  const info = element('div','library-book-info');

  info.append(
    element('h4','',book.title || 'Untitled'),
    element('p','library-book-author',book.author || 'Unknown Author')
  );

  if(book.source === 'community') {
    info.append(
      element('span','library-book-status','🎀 Community Book')
    );
  }

  if(entry) {
    info.append(
      element(
        'span','library-book-status',
        statuses[entry.reading_status] || entry.reading_status
      )
    );

    if(entry.total_pages) {
      const pct = Math.round(
        (entry.current_page ?? 0) / entry.total_pages * 100
      );
      info.append(
        element(
          'p','library-book-progress',
          `📖 ${entry.current_page ?? 0}/${entry.total_pages} pages (${pct}%)`
        )
      );
    }

    if(entry.rating != null) {
      info.append(
        element('p','library-book-rating',`⭐ ${entry.rating}/5`)
      );
    }
  }

  const btn = element(
    'button','',
    entry ? 'Edit My Book 💋' : 'Add to Library 💗'
  );

  btn.type = 'button';
  btn.dataset.action = entry ? 'edit' : 'add';
  btn.dataset.source = book.source;
  btn.dataset.bookId = book.id;

  if(
    !entry &&
    entries.some(e=>entryKey(e) === key(book.source,book.id))
  ) {
    btn.disabled = true;
    btn.textContent = 'Already in My Library ✓';
  }

  if (entry) {
      info.append(btn);

  if (entry) {
    info.append(makeReadingEntryTags(entry.id));

    const tagButton = element(
      'button',
      '',
      '🏷️ Tag This Book'
    );

    tagButton.type = 'button';
    tagButton.dataset.tagEntryId = entry.id;

    info.append(tagButton);
  }

  c.append(info);
  return c;
}

function renderCollection() {
  const target = $('myBookCollection');
  target.replaceChildren();

  const filter = $('libraryStatusFilter').value;
  const matching = entries.filter(
    e => filter === 'all' || e.reading_status === filter
  );

  if(!matching.length) {
    empty(
      target,
      filter === 'all'
        ? 'Your Library is waiting for its first book! 💗'
        : 'No books match this reading status yet.'
    );
    return;
  }

  for(const e of matching) {
    target.append(card(bookForEntry(e),e));
  }
}

function renderResults() {
  const target = $('catalogResults');
  if(!results.length) return;
  target.replaceChildren();

  for(const b of results) {
    target.append(card(b));
  }
}

function sanitizeSearch(s) {
  return s.replace(/[\\%_(),.*"]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

async function search() {
  if(!user || searchBusy) return;

  const term = sanitizeSearch($('bookSearch').value);
  const target = $('catalogResults');

  if(term.length < 2) {
    empty(target,'Enter at least two letters or numbers to search.');
    return;
  }

  searchBusy = true;
  const btn = $('searchCatalog');
  btn.disabled = true;
  btn.textContent = 'Searching...';

  try {
    const queries = await Promise.all([
      db.from('tbb_books')
        .select(officialCols)
        .eq('is_archived',false)
        .or(`title.ilike.%${term}%,author.ilike.%${term}%`)
        .order('title')
        .limit(40),

      db.from('tbb_community_books')
        .select(communityCols)
        .eq('is_archived',false)
        .or(`title.ilike.%${term}%,author.ilike.%${term}%`)
        .order('title')
        .limit(40)
    ]);

    for(const r of queries) {
      if(r.error) throw r.error;
    }

    results = [
      ...(queries[0].data || []).map(b=>({...b,source:'official'})),
      ...(queries[1].data || []).map(b=>({...b,source:'community'}))
    ];

    results.sort((a,b)=>a.title.localeCompare(b.title));

    for(const b of results) {
      catalog.set(key(b.source,b.id),b);
    }

    if(!results.length) {
      empty(
        target,
        'No matching books found. Try Add My Own Book 🎀!'
      );
    } else {
      renderResults();

      if(queries.some(r=>(r.data || []).length === 40)) {
        target.append(
          element(
            'p','library-helper',
            'Showing up to 40 results per catalog. Refine your search for more.'
          )
        );
      }
    }
  } catch(e) {
    console.error(e);
    empty(target,'Search could not be completed.');
    notify(e.message,true);
  } finally {
    searchBusy = false;
    btn.disabled = false;
    btn.textContent = 'Search Catalog 💗';
  }
}

async function addBook(source,id) {
  if(addBusy) return;

  const book = catalog.get(key(source,id));

  if(!book || book.is_archived) {
    notify('This book is unavailable.',true);
    return;
  }

  if(entries.some(e=>entryKey(e) === key(source,id))) {
    notify('Already in your Library! 💗');
    return;
  }

  addBusy = true;

  try {
    const record = {
      user_id:user.id,
      book_id:source === 'official' ? id : null,
      community_book_id:source === 'community' ? id : null,
      reading_status:'want_to_read',
      current_page:0
    };

    const {error} = await db.from('tbb_bookshelf_entries')
      .insert(record);

    if(error) throw error;

    await Promise.all([loadCollection(),stats()]);
    notify(`“${book.title}” was added to your Library! 💗`);
  } catch(e) {
    console.error(e);
    notify(
      e.code === '23505'
        ? 'This book is already in your Library.'
        : e.message,
      true
    );
    await loadCollection().catch(console.error);
  } finally {
    addBusy = false;
    renderResults();
  }
}

function openEditor(source,id) {
  const e = entries.find(x=>entryKey(x) === key(source,id));

  if(!e) {
    notify('Reading record not found.',true);
    return;
  }

  const b = catalog.get(key(source,id));

  $('editingEntryId').value = e.id;
  $('bookEditorTitle').textContent = 'Edit My Reading Record 💋';
  $('bookEditorSubtitle').textContent = b
    ? `${b.title} — ${b.author || 'Unknown Author'}`
    : 'Update your reading details.';

  $('editReadingStatus').value = e.reading_status;
  $('editBookFormat').value = e.book_format || '';
  $('editTotalPages').value = e.total_pages ?? '';
  $('editCurrentPage').value = e.current_page ?? 0;
  $('editRating').value = e.rating ?? '';
  $('editStartedAt').value = e.started_at || '';
  $('editFinishedAt').value = e.finished_at || '';

  $('bookEditor').showModal();
}

function posInt(v,label) {
  if(v === '') return null;
  const n = Number(v);

  if(!Number.isSafeInteger(n) || n <= 0) {
    throw Error(`${label} must be a positive whole number.`);
  }
  return n;
}

function nonneg(v) {
  if(v === '') return 0;
  const n = Number(v);

  if(!Number.isSafeInteger(n) || n < 0) {
    throw Error('Current page must be zero or a positive whole number.');
  }
  return n;
}

function edits() {
  const reading_status = $('editReadingStatus').value;
  const book_format = $('editBookFormat').value || null;

  if(!Object.hasOwn(statuses,reading_status)) {
    throw Error('Invalid reading status.');
  }

  if(
    book_format &&
    !['physical','ebook','audiobook'].includes(book_format)
  ) {
    throw Error('Invalid book format.');
  }

  const total_pages = posInt(
    $('editTotalPages').value,'Total pages'
  );
  const current_page = nonneg($('editCurrentPage').value);

  if(total_pages !== null && current_page > total_pages) {
    throw Error('Current page cannot exceed total pages.');
  }

  const rating = $('editRating').value === ''
    ? null
    : Number($('editRating').value);

  if(
    rating !== null &&
    (rating < .5 || rating > 5 || !Number.isInteger(rating * 2))
  ) {
    throw Error('Rating must be 0.5 to 5 in half-star steps.');
  }

  const started_at = $('editStartedAt').value || null;
  const finished_at = $('editFinishedAt').value || null;

  if(started_at && finished_at && finished_at < started_at) {
    throw Error('Finish date cannot precede start date.');
  }

  return {
    reading_status,book_format,total_pages,current_page,
    rating,started_at,finished_at
  };
}

async function saveEditor(ev) {
  ev.preventDefault();
  if(editBusy) return;

  const id = $('editingEntryId').value;

  if(!entries.some(e=>e.id === id)) {
    notify('Reading record not found.',true);
    return;
  }

  editBusy = true;
  const btn = $('saveBookEditor');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const changes = edits();

    const {data,error} = await db.from('tbb_bookshelf_entries')
      .update(changes)
      .eq('id',id)
      .eq('user_id',user.id)
      .select('id');

    if(error) throw error;
    if(!data?.length) {
      throw Error('Reading record was not updated.');
    }

    $('bookEditor').close();
    await Promise.all([loadCollection(),stats()]);
    notify('Your reading record was saved! 💗');
  } catch(e) {
    console.error(e);
    notify(e.message,true);
  } finally {
    editBusy = false;
    btn.disabled = false;
    btn.textContent = 'Save Reading Record 💗';
  }
}

function actions(ev) {
  const tagButton = ev.target.closest(
    'button[data-tag-entry-id]'
  );

  if (tagButton) {
    if (!tagButton.disabled) {
      openBookTagAssignment(tagButton.dataset.tagEntryId);
    }
    return;
  }

  const btn = ev.target.closest(
    'button[data-action][data-book-id]'
  );

  if (!btn || btn.disabled) return;

  const { source, bookId, action } = btn.dataset;

  if (action === 'add') addBook(source, bookId);
  if (action === 'edit') openEditor(source, bookId);
}

function openCommunity() {
  if(!user) return;
  $('communityBookForm').reset();
  $('communityBookDialog').showModal();
}

async function submitCommunity(ev) {
  ev.preventDefault();
  if(!user || submitBusy) return;

  const title = $('communityBookTitle').value.trim();
  const author = $('communityBookAuthor').value.trim();

  if(!title || !author) {
    notify('Title and author are required.',true);
    return;
  }

  submitBusy = true;
  const btn = $('submitCommunityBook');
  btn.disabled = true;
  btn.textContent = 'Adding...';

  try {
    const {data,error} = await db.rpc(
      'tbb_submit_community_book',
      {
        p_title:title,
        p_author:author,
        p_cover_url:$('communityBookCover').value.trim() || null,
        p_series_name:$('communityBookSeries').value.trim() || null,
        p_book_number:$('communityBookNumber').value.trim() || null
      }
    );

    if(error) throw error;
    if(!data) {
      throw Error('Community book submission returned no book ID.');
    }

    $('communityBookDialog').close();
    await Promise.all([loadCollection(),stats()]);

    notify(
      `“${title}” is in your Library and the shared community catalog! 🎀`
    );

    if($('bookSearch').value.trim().length >= 2) {
      await search();
    }
  } catch(e) {
    console.error('Community book submission:',e);
    notify(
      e.message || 'Could not add this community book.',true
    );
  } finally {
    submitBusy = false;
    btn.disabled = false;
    btn.textContent = 'Add to Community 💗';
  }
}

/* ==========================================
   CUSTOM SHELVES™ + SHELF COVERS™
   PHASE 5 — STEP 4G.6
   ========================================== */

function shelfCoverUrl(path) {
  if(!user || !path) return null;

  const prefix = `${user.id}/`;

  // Only display cover files belonging to this member.
  if(
    typeof path !== 'string' ||
    !path.startsWith(prefix) ||
    path.includes('..') ||
    path.includes('\\')
  ) return null;

  const {data} = db.storage
    .from(SHELF_COVER_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || null;
}

function validateShelfCover(file) {
  if(!file) return;

  if(!Object.hasOwn(SHELF_COVER_TYPES,file.type)) {
    throw Error('Choose a JPG, PNG, or WebP image.');
  }

  if(file.size <= 0 || file.size > SHELF_COVER_MAX_BYTES) {
    throw Error('Shelf covers must be smaller than 5 MB.');
  }
}

function releaseCoverPreview() {
  if(coverPreviewObjectUrl) {
    URL.revokeObjectURL(coverPreviewObjectUrl);
    coverPreviewObjectUrl = null;
  }
}

function showShelfCoverPreview(url=null) {
  const img = $('shelfCoverPreviewImage');
  const placeholder = $('shelfCoverPlaceholder');

  if(!img || !placeholder) return;

  if(url) {
    img.src = url;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    placeholder.hidden = false;
  }
}

function resetShelfCoverEditor(shelf=null) {
  releaseCoverPreview();
  removeExistingCover = false;

  $('shelfCoverFile').value = '';
  $('shelfCoverFileName').textContent =
    'No new image selected.';

  const url = shelf ? shelfCoverUrl(shelf.cover_path) : null;

  showShelfCoverPreview(url);
  $('removeShelfCoverButton').hidden = !url;
}

function chooseShelfCover() {
  const file = $('shelfCoverFile').files?.[0];

  releaseCoverPreview();

  if(!file) {
    const shelf = shelves.find(
      s=>s.id === $('editingShelfId').value
    );

    resetShelfCoverEditor(shelf || null);
    return;
  }

  try {
    validateShelfCover(file);

    coverPreviewObjectUrl = URL.createObjectURL(file);
    showShelfCoverPreview(coverPreviewObjectUrl);

    $('shelfCoverFileName').textContent =
      `Selected: ${file.name}`;

    removeExistingCover = false;
    $('removeShelfCoverButton').hidden = false;
  } catch(e) {
    $('shelfCoverFile').value = '';
    $('shelfCoverFileName').textContent = e.message;
    showShelfCoverPreview();
    notify(e.message,true);
  }
}

function removeShelfCoverSelection() {
  releaseCoverPreview();

  $('shelfCoverFile').value = '';
  $('shelfCoverFileName').textContent =
    'Cover will be removed when you save.';

  removeExistingCover = true;

  showShelfCoverPreview();
  $('removeShelfCoverButton').hidden = true;
}

async function uploadShelfCover(shelfId,file) {
  validateShelfCover(file);

  const ext = SHELF_COVER_TYPES[file.type];

  // Each upload gets a unique filename, preventing stale cached images.
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${user.id}/${shelfId}/${filename}`;

  const {error} = await db.storage
    .from(SHELF_COVER_BUCKET)
    .upload(path,file,{
      contentType:file.type,
      cacheControl:'3600',
      upsert:false
    });

  if(error) throw error;

  return path;
}

async function deleteStoredShelfCover(path) {
  if(!path) return;

  // Never delete arbitrary Storage paths.
  if(!shelfCoverUrl(path)) {
    throw Error('Invalid shelf cover path.');
  }

  const {error} = await db.storage
    .from(SHELF_COVER_BUCKET)
    .remove([path]);

  if(error) throw error;
}

async function saveShelfCoverPath(shelfId,path) {
  const {data,error} = await db.from('tbb_custom_shelves')
    .update({cover_path:path})
    .eq('id',shelfId)
    .eq('user_id',user.id)
    .select('id');

  if(error) throw error;
  if(!data?.length) {
    throw Error('Shelf cover could not be saved.');
  }
}

async function loadShelves() {
  if(!user) return;

  const allShelves = [];
  const allAssignments = [];

  for(let from=0;;from+=500) {
    const {data,error} = await db.from('tbb_custom_shelves')
      .select('id,user_id,name,description,cover_path,created_at,updated_at')
      .eq('user_id',user.id)
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .range(from,from+499);

    if(error) throw error;

    allShelves.push(...(data || []));
    if(!data || data.length < 500) break;
  }

  for(let from=0;;from+=500) {
    const {data,error} = await db.from('tbb_shelf_books')
      .select('id,user_id,shelf_id,bookshelf_entry_id,created_at')
      .eq('user_id',user.id)
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .range(from,from+499);

    if(error) throw error;

    allAssignments.push(...(data || []));
    if(!data || data.length < 500) break;
  }

  shelves = allShelves;
  shelfAssignments = allAssignments;

  renderShelves();

  if(activeShelfId) {
    if(shelves.some(s=>s.id === activeShelfId)) {
      renderShelfDetail();
    } else {
      closeShelfDetail();
    }
  }

  if($('shelfBooksDialog')?.open) renderShelfChoices();
}

function shelfBookCount(shelfId) {
  return shelfAssignments.filter(
    a=>a.shelf_id === shelfId
  ).length;
}

function renderShelves() {
  const target = $('customShelvesList');
  if(!target) return;

  target.replaceChildren();

  if(!shelves.length) {
    empty(
      target,
      'No custom shelves yet! Create your first shelf, Baddie. 🎀'
    );
    return;
  }

  for(const shelf of shelves) {
    const c = element('article','custom-shelf-card');
    const art = element('div','custom-shelf-art');

    const url = shelfCoverUrl(shelf.cover_path);

    if(url) {
      const img = element('img');
      img.src = url;
      img.alt = `Cover for ${shelf.name}`;
      img.loading = 'lazy';

      img.addEventListener('error',()=>{
        img.remove();
      });

      art.append(img);
    }

    const info = element('div','custom-shelf-info');

    const title = element('h3','',shelf.name);
    const description = element(
      'p','',
      shelf.description || 'A whole bookish mood of your own. 💗'
    );

    const total = shelfBookCount(shelf.id);
    const countLabel = element(
      'span','custom-shelf-count',
      `📚 ${total} ${total === 1 ? 'Book' : 'Books'}`
    );

    const btn = element(
      'button','custom-shelf-open','Open Shelf 💗'
    );

    btn.type = 'button';
    btn.dataset.shelfId = shelf.id;

    info.append(title,description,countLabel,btn);
    c.append(art,info);
    target.append(c);
  }
}

function openCreateShelf() {
  if(!user || shelfBusy) return;

  $('customShelfForm').reset();
  $('editingShelfId').value = '';
  $('customShelfDialogTitle').textContent = '🎀 Create a Shelf';
  $('saveShelfButton').textContent = 'Create Shelf 💗';
  $('deleteShelfButton').hidden = true;

  resetShelfCoverEditor();

  $('customShelfDialog').showModal();
}

function openEditShelf() {
  if(!user || shelfBusy || !activeShelfId) return;

  const shelf = shelves.find(
    s=>s.id === activeShelfId
  );

  if(!shelf) {
    notify('Shelf not found.',true);
    return;
  }

  $('customShelfForm').reset();
  $('editingShelfId').value = shelf.id;
  $('customShelfName').value = shelf.name;
  $('customShelfDescriptionInput').value =
    shelf.description || '';

  $('customShelfDialogTitle').textContent =
    '✏️ Edit My Shelf';

  $('saveShelfButton').textContent =
    'Save Changes 💗';

  $('deleteShelfButton').hidden = false;

  resetShelfCoverEditor(shelf);

  $('customShelfDialog').showModal();
}

async function saveShelf(ev) {
  ev.preventDefault();
  if(!user || shelfBusy) return;

  const id = $('editingShelfId').value;
  const name = $('customShelfName').value.trim();
  const description =
    $('customShelfDescriptionInput').value.trim() || null;

  const file = $('shelfCoverFile').files?.[0] || null;

  if(name.length < 1 || name.length > 60) {
    notify(
      'Shelf names must be between 1 and 60 characters.',
      true
    );
    return;
  }

  if(description && description.length > 500) {
    notify(
      'Descriptions must be 500 characters or fewer.',
      true
    );
    return;
  }

  if(id && !shelves.some(s=>s.id === id)) {
    notify('This shelf no longer exists.',true);
    return;
  }

  try {
    validateShelfCover(file);
  } catch(e) {
    notify(e.message,true);
    return;
  }

  shelfBusy = true;

  const btn = $('saveShelfButton');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  let shelfId = id;
  let created = false;
  let newCoverPath = null;
  let coverSaved = false;
  let coverWarning = '';

  const previousShelf = shelves.find(
    s=>s.id === id
  );

  const oldCoverPath = previousShelf?.cover_path || null;

  try {
    // Save shelf metadata first.
    if(id) {
      const {data,error} = await db.from('tbb_custom_shelves')
        .update({name,description})
        .eq('id',id)
        .eq('user_id',user.id)
        .select('id');

      if(error) throw error;
      if(!data?.length) {
        throw Error('Shelf could not be updated.');
      }
    } else {
      const {data,error} = await db.from('tbb_custom_shelves')
        .insert({
          user_id:user.id,
          name,
          description
        })
        .select('id')
        .single();

      if(error) throw error;
      if(!data?.id) {
        throw Error('Shelf could not be created.');
      }

      shelfId = data.id;
      created = true;
    }

    // Upload a new image, if one was selected.
    if(file) {
      try {
        newCoverPath = await uploadShelfCover(shelfId,file);
        await saveShelfCoverPath(shelfId,newCoverPath);
        coverSaved = true;
      } catch(e) {
        console.error('Shelf cover upload:',e);
        coverWarning =
          'Shelf saved, but the cover could not be uploaded. ' +
          (e.message || '');

        // Clean up an uploaded file if saving its path failed.
        if(newCoverPath && !coverSaved) {
          await deleteStoredShelfCover(newCoverPath)
            .catch(console.error);
        }
      }

      // Remove the old cover only after the new path is saved.
      if(coverSaved && oldCoverPath) {
        await deleteStoredShelfCover(oldCoverPath)
          .catch(console.error);
      }
    } else if(removeExistingCover && oldCoverPath) {
      try {
        await saveShelfCoverPath(shelfId,null);
        coverSaved = true;

        await deleteStoredShelfCover(oldCoverPath)
          .catch(console.error);
      } catch(e) {
        console.error('Remove shelf cover:',e);
        coverWarning =
          'Shelf saved, but the old cover could not be removed.';
      }
    }

    $('customShelfDialog').close();
    releaseCoverPreview();

    await Promise.all([loadShelves(),stats()]);

    if(coverWarning) {
      notify(coverWarning,true);
    } else {
      notify(
        created
          ? `“${name}” is now on your Bookshelf! 🎀`
          : `“${name}” has been updated! 💗`
      );
    }
  } catch(e) {
    console.error('Save shelf:',e);
    notify(
      e.message || 'Could not save your shelf.',
      true
    );
  } finally {
    shelfBusy = false;
    btn.disabled = false;
    btn.textContent =
      id ? 'Save Changes 💗' : 'Create Shelf 💗';
  }
}

async function deleteShelf() {
  if(!user || shelfBusy) return;

  const id = $('editingShelfId').value;
  const shelf = shelves.find(s=>s.id === id);
  if(!shelf) return;

  const confirmed = window.confirm(
    `Delete “${shelf.name}”?\n\n` +
    'This removes the shelf and its book assignments. ' +
    'Your books and reading records stay in My Library™.'
  );

  if(!confirmed) return;

  shelfBusy = true;

  $('deleteShelfButton').disabled = true;
  $('saveShelfButton').disabled = true;

  try {
    // Storage permissions require the shelf to exist.
    if(shelf.cover_path) {
      await deleteStoredShelfCover(shelf.cover_path);
    }

    const {data,error} = await db.from('tbb_custom_shelves')
      .delete()
      .eq('id',id)
      .eq('user_id',user.id)
      .select('id');

    if(error) throw error;
    if(!data?.length) {
      throw Error('Shelf was not deleted.');
    }

    $('customShelfDialog').close();
    releaseCoverPreview();
    closeShelfDetail();

    await Promise.all([loadShelves(),stats()]);

    notify(
      `“${shelf.name}” was deleted. Your books are safe! 💗`
    );
  } catch(e) {
    console.error('Delete shelf:',e);
    notify(
      e.message || 'Could not delete shelf.',
      true
    );
  } finally {
    shelfBusy = false;
    $('deleteShelfButton').disabled = false;
    $('saveShelfButton').disabled = false;
  }
}

function openShelfDetail(id) {
  const shelf = shelves.find(s=>s.id === id);

  if(!shelf) {
    notify('Shelf not found.',true);
    return;
  }

  activeShelfId = id;
  $('customShelfDetail').hidden = false;

  renderShelfDetail();

  $('customShelfDetail').scrollIntoView({
    behavior:'smooth',
    block:'start'
  });
}

function closeShelfDetail() {
  activeShelfId = null;
  $('customShelfDetail').hidden = true;
  $('customShelfTitle').textContent = 'My Shelf';
  $('customShelfDescription').textContent = '';
  $('customShelfBookCount').textContent = '';
  $('customShelfBooks').replaceChildren();
}

function renderShelfDetail() {
  if(!activeShelfId) return;

  const shelf = shelves.find(
    s=>s.id === activeShelfId
  );

  if(!shelf) return;

  $('customShelfTitle').textContent =
    `🎀 ${shelf.name}`;

  $('customShelfDescription').textContent =
    shelf.description ||
    'Your personalized bookish collection. 💗';

  const assignments = shelfAssignments.filter(
    a=>a.shelf_id === activeShelfId
  );

  $('customShelfBookCount').textContent =
    `${assignments.length} ${
      assignments.length === 1 ? 'book' : 'books'
    } on this shelf`;

  const target = $('customShelfBooks');
  target.replaceChildren();

  if(!assignments.length) {
    empty(
      target,
      'This shelf is waiting for its first obsession. Add a book! 📚'
    );
    return;
  }

  for(const assignment of assignments) {
    const entry = entries.find(
      e=>e.id === assignment.bookshelf_entry_id
    );

    if(!entry) continue;

    const c = card(bookForEntry(entry),entry);

    const info = c.querySelector(
      '.library-book-info'
    );

    const remove = element(
      'button','','Remove from Shelf 🗑️'
    );

    remove.type = 'button';
    remove.dataset.assignmentId =
      assignment.id;

    info.append(remove);
    target.append(c);
  }

  if(!target.children.length) {
    empty(
      target,
      'No available reading records found on this shelf.'
    );
  }
}

function openShelfBooks() {
  if(!user || !activeShelfId) return;

  const shelf = shelves.find(
    s=>s.id === activeShelfId
  );

  if(!shelf) return;

  $('shelfBookSearch').value = '';

  $('shelfBooksDialogSubtitle').textContent =
    `Choose books from My Library™ for “${shelf.name}”.`;

  renderShelfChoices();
  $('shelfBooksDialog').showModal();
}

function renderShelfChoices() {
  if(!activeShelfId) return;

  const target = $('shelfBookChoices');
  target.replaceChildren();

  const term = $('shelfBookSearch')
    .value.trim().toLowerCase();

  const matching = entries.filter(e=>{
    const book = bookForEntry(e);

    return !term ||
      book.title.toLowerCase().includes(term) ||
      (book.author || '').toLowerCase().includes(term);
  });

  if(!matching.length) {
    empty(
      target,
      entries.length
        ? 'No books match that search.'
        : 'Add books to My Library™ first, then organize them here. 💗'
    );
    return;
  }

  for(const entry of matching) {
    const book = bookForEntry(entry);

    const assigned = shelfAssignments.some(
      a=>a.shelf_id === activeShelfId &&
         a.bookshelf_entry_id === entry.id
    );

    const c = element(
      'article','shelf-book-choice'
    );

    c.append(
      element('h4','',book.title),
      element('p','',book.author || 'Unknown Author'),
      element(
        'p','',
        statuses[entry.reading_status] ||
          entry.reading_status
      )
    );

    const btn = element(
      'button','',
      assigned
        ? '✓ On Shelf — Remove'
        : '+ Add to Shelf 💗'
    );

    btn.type = 'button';
    btn.dataset.entryId = entry.id;
    btn.dataset.assignmentAction =
      assigned ? 'remove' : 'add';

    btn.setAttribute(
      'aria-pressed',String(assigned)
    );

    btn.disabled = assignmentBusy;

    c.append(btn);
    target.append(c);
  }
}

async function updateShelfAssignment(entryId,action) {
  if(
    !user ||
    !activeShelfId ||
    assignmentBusy
  ) return;

  const shelfId = activeShelfId;

  if(!shelves.some(s=>s.id === shelfId)) {
    notify('Shelf not found.',true);
    return;
  }

  if(!entries.some(e=>e.id === entryId)) {
    notify(
      'Book not found in My Library™.',
      true
    );
    return;
  }

  assignmentBusy = true;
  renderShelfChoices();

  try {
    if(action === 'add') {
      const already = shelfAssignments.some(
        a=>a.shelf_id === shelfId &&
           a.bookshelf_entry_id === entryId
      );

      if(already) return;

      const {error} = await db
        .from('tbb_shelf_books')
        .insert({
          user_id:user.id,
          shelf_id:shelfId,
          bookshelf_entry_id:entryId
        });

      if(error && error.code !== '23505') {
        throw error;
      }
    } else if(action === 'remove') {
      const assignment = shelfAssignments.find(
        a=>a.shelf_id === shelfId &&
           a.bookshelf_entry_id === entryId
      );

      if(!assignment) return;

      const {data,error} = await db
        .from('tbb_shelf_books')
        .delete()
        .eq('id',assignment.id)
        .eq('user_id',user.id)
        .eq('shelf_id',shelfId)
        .select('id');

      if(error) throw error;

      if(!data?.length) {
        throw Error('Book could not be removed.');
      }
    } else {
      throw Error('Unknown shelf action.');
    }

    await loadShelves();

    notify(
      action === 'add'
        ? 'Book added to your shelf! 💗'
        : 'Book removed from shelf. Your Library record is safe! 🎀'
    );
  } catch(e) {
    console.error('Shelf assignment:',e);
    notify(
      e.message ||
        'Could not update this shelf.',
      true
    );
  } finally {
    assignmentBusy = false;
    renderShelfChoices();
  }
}

async function removeFromShelf(assignmentId) {
  if(
    !user ||
    !activeShelfId ||
    assignmentBusy
  ) return;

  const assignment = shelfAssignments.find(
    a=>a.id === assignmentId &&
       a.shelf_id === activeShelfId
  );

  if(!assignment) return;

  await updateShelfAssignment(
    assignment.bookshelf_entry_id,
    'remove'
  );
}



/* ==========================================
   MY BOOK TAGS™
   PHASE 5 — STEP 4G.7 | PART 1
   CUSTOM TAG MANAGEMENT
   ========================================== */

let bookTags = [];
let bookTagBusy = false;

const DEFAULT_BOOK_TAG_COLOR = '#F8BFDC';

function normalizeBookTagColor(value) {
  const color = String(value || '').trim().toUpperCase();

  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw Error('Please choose a valid tag color.');
  }

  return color;
}

function bookTagError(error) {
  if (error?.code === '23505') {
    return 'That tag name or color is already in your collection. Choose something different! 💗';
  }

  return error?.message || 'Something went wrong with your book tags.';
}

async function loadBookTags() {
  if (!user) return;

  const all = [];

  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from('tbb_book_tags')
      .select('id,user_id,name,color,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 499);

    if (error) throw error;

    all.push(...(data || []));

    if (!data || data.length < 500) break;
  }

  bookTags = all;

  renderBookTags();
  renderCollection();

  if (activeShelfId) renderShelfDetail();

    if ($('bookTagAssignmentDialog')?.open) {
    renderBookTagAssignmentChoices();
  }
}

function makeBookTagChip(tag) {
  const chip = element('span', 'book-tag-chip', `🏷️ ${tag.name}`);

  chip.style.setProperty('--tag-color', tag.color);

  return chip;
}

function renderBookTags() {
  const target = $('myBookTagsList');
  if (!target) return;

  target.replaceChildren();

  if (!bookTags.length) {
    empty(
      target,
      'No custom tags yet! Create your first colorful book tag. 🌈💗'
    );
    return;
  }

  for (const tag of bookTags) {
    const card = element('article', 'book-tag-card');

    const chip = makeBookTagChip(tag);

    const actions = element('div', 'book-tag-card-actions');

    const editButton = element('button', '', 'Edit Tag ✏️');
    editButton.type = 'button';
    editButton.dataset.editBookTagId = tag.id;

    actions.append(editButton);
    card.append(chip, actions);
    target.append(card);
  }
}

function openCreateBookTag() {
  if (!user || bookTagBusy) return;

  $('bookTagForm').reset();
  $('editingBookTagId').value = '';
  $('bookTagName').value = '';
  $('bookTagColor').value = DEFAULT_BOOK_TAG_COLOR;

  $('bookTagDialogTitle').textContent = '🎀 Create a Book Tag';
  $('saveBookTagButton').textContent = 'Create Tag 💗';
  $('deleteBookTagButton').hidden = true;

  $('bookTagDialog').showModal();
}

function openEditBookTag(id) {
  if (!user || bookTagBusy) return;

  const tag = bookTags.find(item => item.id === id);

  if (!tag) {
    notify('That book tag could not be found.', true);
    return;
  }

  $('bookTagForm').reset();
  $('editingBookTagId').value = tag.id;
  $('bookTagName').value = tag.name;
  $('bookTagColor').value = tag.color;

  $('bookTagDialogTitle').textContent = '✏️ Edit My Book Tag';
  $('saveBookTagButton').textContent = 'Save Changes 💗';
  $('deleteBookTagButton').hidden = false;

  $('bookTagDialog').showModal();
}

async function saveBookTag(event) {
  event.preventDefault();

  if (!user || bookTagBusy) return;

  const id = $('editingBookTagId').value;
  const name = $('bookTagName').value.trim();

  if (name.length < 1 || name.length > 40) {
    notify('Tag names must be between 1 and 40 characters.', true);
    return;
  }

  if (id && !bookTags.some(tag => tag.id === id)) {
    notify('That book tag no longer exists.', true);
    return;
  }

  let color;

  try {
    color = normalizeBookTagColor($('bookTagColor').value);
  } catch (error) {
    notify(error.message, true);
    return;
  }

  const duplicateColor = bookTags.some(
    tag => tag.id !== id &&
      tag.color.toUpperCase() === color
  );

  if (duplicateColor) {
    notify(
      'Another one of your tags already uses that color. Pick a different shade! 🌈',
      true
    );
    return;
  }

  const duplicateName = bookTags.some(
    tag => tag.id !== id &&
      tag.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (duplicateName) {
    notify('You already have a tag with that name! 💗', true);
    return;
  }

  bookTagBusy = true;

  const button = $('saveBookTagButton');
  button.disabled = true;
  $('deleteBookTagButton').disabled = true;
  button.textContent = 'Saving...';

  try {
    if (id) {
      const { data, error } = await db
        .from('tbb_book_tags')
        .update({ name, color })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;

      if (!data?.length) {
        throw Error('Your tag could not be updated.');
      }
    } else {
      const { data, error } = await db
        .from('tbb_book_tags')
        .insert({
          user_id: user.id,
          name,
          color
        })
        .select('id');

      if (error) throw error;

      if (!data?.length) {
        throw Error('Your tag could not be created.');
      }
    }

    $('bookTagDialog').close();

    await loadBookTags();

    notify(
      id
        ? `“${name}” has been updated! 💗`
        : `“${name}” is officially in your tag collection! 🌈`
    );
  } catch (error) {
    console.error('Save book tag:', error);
    notify(bookTagError(error), true);
  } finally {
    bookTagBusy = false;
    button.disabled = false;
    $('deleteBookTagButton').disabled = false;
    button.textContent = id ? 'Save Changes 💗' : 'Create Tag 💗';
  }
}

async function deleteBookTag() {
  if (!user || bookTagBusy) return;

  const id = $('editingBookTagId').value;
  const tag = bookTags.find(item => item.id === id);

  if (!tag) return;

  const confirmed = window.confirm(
    `Delete “${tag.name}”?\n\n` +
    'This removes the tag from every book it is assigned to. ' +
    'Your books and reading records will NOT be deleted.'
  );

  if (!confirmed) return;

  bookTagBusy = true;

  $('deleteBookTagButton').disabled = true;
  $('saveBookTagButton').disabled = true;

  try {
    const { data, error } = await db
      .from('tbb_book_tags')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id');

    if (error) throw error;

    if (!data?.length) {
      throw Error('Your tag could not be deleted.');
    }

    $('bookTagDialog').close();

    await loadBookTags();

    notify(
      `“${tag.name}” was deleted. Your books are safe! 💗`
    );
  } catch (error) {
    console.error('Delete book tag:', error);
    notify(bookTagError(error), true);
  } finally {
    bookTagBusy = false;
    $('deleteBookTagButton').disabled = false;
    $('saveBookTagButton').disabled = false;
  }
}

/* ==========================================
   BOOK TAGS™ EVENT LISTENERS
   ========================================== */

$('createBookTagButton')?.addEventListener(
  'click',
  openCreateBookTag
);

$('myBookTagsList')?.addEventListener('click', event => {
  const button = event.target.closest(
    'button[data-edit-book-tag-id]'
  );

  if (!button) return;

  openEditBookTag(button.dataset.editBookTagId);
});

$('bookTagForm')?.addEventListener(
  'submit',
  saveBookTag
);

$('cancelBookTagButton')?.addEventListener('click', () => {
  if (!bookTagBusy) $('bookTagDialog').close();
});

$('deleteBookTagButton')?.addEventListener(
  'click',
  deleteBookTag
);

$('bookTagDialog')?.addEventListener('cancel', event => {
  if (bookTagBusy) event.preventDefault();
});


/* ==========================================
   BOOK TAGS™ — PART 2
   ASSIGN TAGS TO READING RECORDS
   ========================================== */

let entryTagAssignments = [];
let bookTagAssignmentBusy = false;

async function loadEntryTagAssignments() {
  if (!user) return;

  const all = [];

  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from('tbb_entry_tags')
      .select('id,user_id,bookshelf_entry_id,tag_id,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 499);

    if (error) throw error;

    all.push(...(data || []));

    if (!data || data.length < 500) break;
  }

  entryTagAssignments = all;

  renderCollection();

  if (activeShelfId) renderShelfDetail();

  if ($('bookTagAssignmentDialog')?.open) {
    renderBookTagAssignmentChoices();
  }
}

function tagsForReadingEntry(entryId) {
  const assignedIds = new Set(
    entryTagAssignments
      .filter(a => a.bookshelf_entry_id === entryId)
      .map(a => a.tag_id)
  );

  return bookTags.filter(tag => assignedIds.has(tag.id));
}

function makeReadingEntryTags(entryId) {
  const tags = tagsForReadingEntry(entryId);

  const wrapper = element('div', 'library-book-tags');

  for (const tag of tags) {
    wrapper.append(makeBookTagChip(tag));
  }

  return wrapper;
}

function openBookTagAssignment(entryId) {
  if (!user || bookTagAssignmentBusy) return;

  const entry = entries.find(item => item.id === entryId);

  if (!entry) {
    notify('This reading record could not be found.', true);
    return;
  }

  const book = bookForEntry(entry);

  $('taggingBookshelfEntryId').value = entry.id;

  $('bookTagAssignmentSubtitle').textContent =
    `Choose tags for “${book.title}”. You can select more than one! 💗`;

  renderBookTagAssignmentChoices();

  $('bookTagAssignmentDialog').showModal();
}

function renderBookTagAssignmentChoices() {
  const target = $('bookTagAssignmentChoices');

  if (!target) return;

  target.replaceChildren();

  const entryId = $('taggingBookshelfEntryId').value;

  if (!entryId) return;

  if (!bookTags.length) {
    empty(
      target,
      'You have no tags yet! Close this window and create your first tag in My Book Tags™. 🌈'
    );
    return;
  }

  const assignedIds = new Set(
    entryTagAssignments
      .filter(a => a.bookshelf_entry_id === entryId)
      .map(a => a.tag_id)
  );

  for (const tag of bookTags) {
    const selected = assignedIds.has(tag.id);

    const choice = element('button', 'book-tag-choice');

    choice.type = 'button';
    choice.dataset.tagId = tag.id;

    choice.setAttribute('aria-pressed', String(selected));

    choice.disabled = bookTagAssignmentBusy;

    choice.style.setProperty('--tag-color', tag.color);

    const label = element(
      'span',
      'book-tag-chip',
      `${selected ? '✓ ' : '＋ '}${tag.name}`
    );

    label.style.setProperty('--tag-color', tag.color);

    choice.append(label);

    target.append(choice);
  }
}

async function toggleBookTagAssignment(tagId) {
  if (!user || bookTagAssignmentBusy) return;

  const entryId = $('taggingBookshelfEntryId').value;

  if (!entries.some(entry => entry.id === entryId)) {
    notify('Reading record not found.', true);
    return;
  }

  if (!bookTags.some(tag => tag.id === tagId)) {
    notify('This tag no longer exists.', true);
    return;
  }

  const existing = entryTagAssignments.find(
    a => a.bookshelf_entry_id === entryId && a.tag_id === tagId
  );

  bookTagAssignmentBusy = true;
  renderBookTagAssignmentChoices();

  try {
    if (existing) {
      const { data, error } = await db
        .from('tbb_entry_tags')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;

      if (!data?.length) {
        throw Error('Could not remove that tag from this book.');
      }
    } else {
      const { error } = await db
        .from('tbb_entry_tags')
        .insert({
          user_id: user.id,
          bookshelf_entry_id: entryId,
          tag_id: tagId
        });

      if (error && error.code !== '23505') {
        throw error;
      }
    }

    await loadEntryTagAssignments();

    notify(
      existing
        ? 'Tag removed from this book! 💗'
        : 'Tag added to this book! 🌈🏷️'
    );
  } catch (error) {
    console.error('Book tag assignment:', error);

    notify(
      error.message || 'Could not update the book tags.',
      true
    );
  } finally {
    bookTagAssignmentBusy = false;
    renderBookTagAssignmentChoices();
  }
}

/* ==========================================
   BOOK TAG ASSIGNMENT LISTENERS
   ========================================== */

$('bookTagAssignmentChoices')?.addEventListener('click', event => {
  const button = event.target.closest('button[data-tag-id]');

  if (!button || button.disabled) return;

  toggleBookTagAssignment(button.dataset.tagId);
});

$('closeBookTagAssignmentButton')?.addEventListener('click', () => {
  if (!bookTagAssignmentBusy) {
    $('bookTagAssignmentDialog').close();
  }
});

$('bookTagAssignmentDialog')?.addEventListener('cancel', event => {
  if (bookTagAssignmentBusy) event.preventDefault();
});

/* ==========================================
   INITIALIZATION
   ========================================== */

async function init() {
  try {
    const access = await requireAccess();
    if(!access) return;

    user = access.user;

    await owner();

    await Promise.all([
      loadCollection(),
      loadShelves(),
      loadBookTags(),
      loadEntryTagAssignments(),
      stats()
    ]);
    notify('Your Bookshelf is ready, Baddie! 💗');
  } catch(e) {
    console.error('Bookshelf initialization:',e);
    notify(
      e.message || 'Bookshelf could not be loaded.',
      true
    );
  }
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

$('logout')?.addEventListener('click',logout);

$('searchCatalog')?.addEventListener('click',search);

$('bookSearch')?.addEventListener('keydown',e=>{
  if(e.key === 'Enter') {
    e.preventDefault();
    search();
  }
});

$('catalogResults')?.addEventListener('click',actions);
$('myBookCollection')?.addEventListener('click',actions);

$('libraryStatusFilter')?.addEventListener(
  'change',renderCollection
);

$('bookEditorForm')?.addEventListener(
  'submit',saveEditor
);

$('cancelBookEditor')?.addEventListener('click',()=>{
  if(!editBusy) $('bookEditor').close();
});

$('bookEditor')?.addEventListener('cancel',e=>{
  if(editBusy) e.preventDefault();
});

$('openCommunityBookForm')?.addEventListener(
  'click',openCommunity
);

$('communityBookForm')?.addEventListener(
  'submit',submitCommunity
);

$('cancelCommunityBook')?.addEventListener('click',()=>{
  if(!submitBusy) $('communityBookDialog').close();
});

$('communityBookDialog')?.addEventListener('cancel',e=>{
  if(submitBusy) e.preventDefault();
});

/* ==========================================
   CUSTOM SHELVES™ LISTENERS
   ========================================== */

$('createShelfButton')?.addEventListener(
  'click',openCreateShelf
);

$('customShelfForm')?.addEventListener(
  'submit',saveShelf
);

$('cancelShelfForm')?.addEventListener('click',()=>{
  if(!shelfBusy) {
    $('customShelfDialog').close();
    releaseCoverPreview();
  }
});

$('customShelfDialog')?.addEventListener('cancel',e=>{
  if(shelfBusy) {
    e.preventDefault();
  } else {
    releaseCoverPreview();
  }
});

$('deleteShelfButton')?.addEventListener(
  'click',deleteShelf
);

$('customShelvesList')?.addEventListener('click',e=>{
  const btn = e.target.closest(
    'button[data-shelf-id]'
  );

  if(btn) openShelfDetail(btn.dataset.shelfId);
});

$('backToShelves')?.addEventListener(
  'click',closeShelfDetail
);

$('editShelfButton')?.addEventListener(
  'click',openEditShelf
);

$('addShelfBooksButton')?.addEventListener(
  'click',openShelfBooks
);

$('closeShelfBooksDialog')?.addEventListener('click',()=>{
  if(!assignmentBusy) {
    $('shelfBooksDialog').close();
  }
});

$('shelfBooksDialog')?.addEventListener('cancel',e=>{
  if(assignmentBusy) e.preventDefault();
});

$('shelfBookSearch')?.addEventListener(
  'input',renderShelfChoices
);

$('shelfBookChoices')?.addEventListener('click',e=>{
  const btn = e.target.closest(
    'button[data-entry-id][data-assignment-action]'
  );

  if(!btn || btn.disabled) return;

  updateShelfAssignment(
    btn.dataset.entryId,
    btn.dataset.assignmentAction
  );
});

$('customShelfBooks')?.addEventListener('click',e=>{
  const remove = e.target.closest(
    'button[data-assignment-id]'
  );

  if(remove) {
    removeFromShelf(remove.dataset.assignmentId);
    return;
  }

  actions(e);
});

/* ==========================================
   CUSTOM SHELF COVER™ LISTENERS
   ========================================== */

$('shelfCoverFile')?.addEventListener(
  'change',chooseShelfCover
);

$('removeShelfCoverButton')?.addEventListener(
  'click',removeShelfCoverSelection
);

$('shelfCoverPreviewImage')?.addEventListener(
  'error',()=>{
    // Do not replace the image with untrusted HTML.
    showShelfCoverPreview();
  }
);

window.addEventListener('beforeunload',()=>{
  releaseCoverPreview();
});

/* ==========================================
   START THE BOOKSHELF™
   ========================================== */

init();}
