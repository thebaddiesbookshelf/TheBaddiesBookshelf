
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

  info.append(btn);
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
  const btn = ev.target.closest(
    'button[data-action][data-book-id]'
  );
  if(!btn || btn.disabled) return;

  const {source,bookId,action} = btn.dataset;

  if(action === 'add') addBook(source,bookId);
  if(action === 'edit') openEditor(source,bookId);
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
   CUSTOM SHELVES™
   PHASE 5 — STEP 4G.5
   ========================================== */

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
  return shelfAssignments.filter(a=>a.shelf_id === shelfId).length;
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

    // Cover upload will be added in a later step.
    // Never interpret cover_path as an arbitrary public URL.

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

    const btn = element('button','custom-shelf-open','Open Shelf 💗');
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
  $('customShelfDialog').showModal();
}

function openEditShelf() {
  if(!user || shelfBusy || !activeShelfId) return;

  const shelf = shelves.find(s=>s.id === activeShelfId);
  if(!shelf) {
    notify('Shelf not found.',true);
    return;
  }

  $('customShelfForm').reset();
  $('editingShelfId').value = shelf.id;
  $('customShelfName').value = shelf.name;
  $('customShelfDescriptionInput').value = shelf.description || '';
  $('customShelfDialogTitle').textContent = '✏️ Edit My Shelf';
  $('saveShelfButton').textContent = 'Save Changes 💗';
  $('deleteShelfButton').hidden = false;
  $('customShelfDialog').showModal();
}

async function saveShelf(ev) {
  ev.preventDefault();
  if(!user || shelfBusy) return;

  const id = $('editingShelfId').value;
  const name = $('customShelfName').value.trim();
  const description =
    $('customShelfDescriptionInput').value.trim() || null;

  if(name.length < 1 || name.length > 60) {
    notify('Shelf names must be between 1 and 60 characters.',true);
    return;
  }

  if(description && description.length > 500) {
    notify('Descriptions must be 500 characters or fewer.',true);
    return;
  }

  if(id && !shelves.some(s=>s.id === id)) {
    notify('This shelf no longer exists.',true);
    return;
  }

  shelfBusy = true;
  const btn = $('saveShelfButton');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    if(id) {
      const {data,error} = await db.from('tbb_custom_shelves')
        .update({name,description})
        .eq('id',id)
        .eq('user_id',user.id)
        .select('id');

      if(error) throw error;
      if(!data?.length) throw Error('Shelf could not be updated.');
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
      if(!data?.id) throw Error('Shelf could not be created.');
    }

    $('customShelfDialog').close();

    await Promise.all([loadShelves(),stats()]);

    notify(
      id
        ? `“${name}” has been updated! 💗`
        : `“${name}” is now on your Bookshelf! 🎀`
    );
  } catch(e) {
    console.error('Save shelf:',e);
    notify(e.message || 'Could not save your shelf.',true);
  } finally {
    shelfBusy = false;
    btn.disabled = false;
    btn.textContent = id ? 'Save Changes 💗' : 'Create Shelf 💗';
  }
}

async function deleteShelf() {
  if(!user || shelfBusy) return;

  const id = $('editingShelfId').value;
  const shelf = shelves.find(s=>s.id === id);
  if(!shelf) return;

  const confirmed = window.confirm(
    `Delete “${shelf.name}”?\n\n` +
    'This will remove the shelf and its book assignments. ' +
    'Your books and reading records will stay in My Library™.'
  );

  if(!confirmed) return;

  shelfBusy = true;
  $('deleteShelfButton').disabled = true;
  $('saveShelfButton').disabled = true;

  try {
    const {data,error} = await db.from('tbb_custom_shelves')
      .delete()
      .eq('id',id)
      .eq('user_id',user.id)
      .select('id');

    if(error) throw error;
    if(!data?.length) throw Error('Shelf was not deleted.');

    $('customShelfDialog').close();
    closeShelfDetail();

    await Promise.all([loadShelves(),stats()]);
    notify(`“${shelf.name}” was deleted. Your books are safe! 💗`);
  } catch(e) {
    console.error('Delete shelf:',e);
    notify(e.message || 'Could not delete shelf.',true);
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

  const shelf = shelves.find(s=>s.id === activeShelfId);
  if(!shelf) return;

  $('customShelfTitle').textContent = `🎀 ${shelf.name}`;
  $('customShelfDescription').textContent =
    shelf.description || 'Your personalized bookish collection. 💗';

  const assignments = shelfAssignments.filter(
    a=>a.shelf_id === activeShelfId
  );

  $('customShelfBookCount').textContent =
    `${assignments.length} ${assignments.length === 1 ? 'book' : 'books'} on this shelf`;

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

    const info = c.querySelector('.library-book-info');
    const remove = element(
      'button','','Remove from Shelf 🗑️'
    );

    remove.type = 'button';
    remove.dataset.assignmentId = assignment.id;

    info.append(remove);
    target.append(c);
  }

  if(!target.children.length) {
    empty(target,'No available reading records found on this shelf.');
  }
}

function openShelfBooks() {
  if(!user || !activeShelfId) return;

  const shelf = shelves.find(s=>s.id === activeShelfId);
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

  const term = $('shelfBookSearch').value.trim().toLowerCase();

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

    const c = element('article','shelf-book-choice');
    c.append(
      element('h4','',book.title),
      element('p','',book.author || 'Unknown Author'),
      element(
        'p','',
        statuses[entry.reading_status] || entry.reading_status
      )
    );

    const btn = element(
      'button','',
      assigned ? '✓ On Shelf — Remove' : '+ Add to Shelf 💗'
    );

    btn.type = 'button';
    btn.dataset.entryId = entry.id;
    btn.dataset.assignmentAction = assigned ? 'remove' : 'add';
    btn.setAttribute('aria-pressed',String(assigned));
    btn.disabled = assignmentBusy;

    c.append(btn);
    target.append(c);
  }
}

async function updateShelfAssignment(entryId,action) {
  if(!user || !activeShelfId || assignmentBusy) return;

  const shelfId = activeShelfId;

  if(!shelves.some(s=>s.id === shelfId)) {
    notify('Shelf not found.',true);
    return;
  }

  if(!entries.some(e=>e.id === entryId)) {
    notify('Book not found in My Library™.',true);
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

      const {error} = await db.from('tbb_shelf_books')
        .insert({
          user_id:user.id,
          shelf_id:shelfId,
          bookshelf_entry_id:entryId
        });

      if(error && error.code !== '23505') throw error;
    } else if(action === 'remove') {
      const assignment = shelfAssignments.find(
        a=>a.shelf_id === shelfId &&
           a.bookshelf_entry_id === entryId
      );

      if(!assignment) return;

      const {data,error} = await db.from('tbb_shelf_books')
        .delete()
        .eq('id',assignment.id)
        .eq('user_id',user.id)
        .eq('shelf_id',shelfId)
        .select('id');

      if(error) throw error;
      if(!data?.length) throw Error('Book could not be removed.');
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
    notify(e.message || 'Could not update this shelf.',true);
  } finally {
    assignmentBusy = false;
    renderShelfChoices();
  }
}

async function removeFromShelf(assignmentId) {
  if(!user || !activeShelfId || assignmentBusy) return;

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

// CUSTOM SHELVES™ LISTENERS

$('createShelfButton')?.addEventListener(
  'click',openCreateShelf
);

$('customShelfForm')?.addEventListener(
  'submit',saveShelf
);

$('cancelShelfForm')?.addEventListener('click',()=>{
  if(!shelfBusy) $('customShelfDialog').close();
});

$('customShelfDialog')?.addEventListener('cancel',e=>{
  if(shelfBusy) e.preventDefault();
});

$('deleteShelfButton')?.addEventListener(
  'click',deleteShelf
);

$('customShelvesList')?.addEventListener('click',e=>{
  const btn = e.target.closest('button[data-shelf-id]');
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
  if(!assignmentBusy) $('shelfBooksDialog').close();
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

init();
