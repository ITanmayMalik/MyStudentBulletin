import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from './lib/firebase'
import { sanitizeISBN } from './lib/validation'

const SCHOOL_SUGGESTIONS = [
  'University of Alberta', 'MacEwan University', 'NAIT', 'NorQuest College',
  'University of Calgary', 'Mount Royal University', 'SAIT', 'Bow Valley College',
  'High School',
]
const emptyListing = {
  title: '', author: '', description: '', isbn: '', year_published: '', campus: '',
  course_subject: '', course_number: '', price: '', has_code: false,
}

function AuthScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [campus, setCampus] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      if (mode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email: result.user.email,
          campus,
          created_at: serverTimestamp(),
        })
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (caught) {
      setError(caught.message.replace('Firebase: ', ''))
    }
  }

  return (
    <main className="auth-shell">
      <datalist id="school-options">{SCHOOL_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
      <section className="auth-panel">
        <p className="eyebrow">BUILT FOR STUDENTS</p>
        <h1>Pass books<br />forward.</h1>
        <p className="muted">A local marketplace for physical textbooks—from high school through university.</p>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <p className="eyebrow">MYSTUDENTBULLETIN</p>
          <h2>{mode === 'signin' ? 'Welcome back.' : 'Join the board.'}</h2>
        </div>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {mode === 'signup' && (
          <label>School <span className="optional">Optional</span><input list="school-options" value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="College, university, or high school" /></label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">{mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
        <button className="text-button" type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Need an account?' : 'Already registered?'}
        </button>
      </form>
    </main>
  )
}

function ListingForm({ user, onClose }) {
  const [form, setForm] = useState(emptyListing)
  const [photos, setPhotos] = useState([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [error, setError] = useState('')

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function addPhotos(event) {
    const selected = [...event.target.files]
    const allowed = selected.filter((file) => ['image/png', 'image/jpeg'].includes(file.type))
    if (allowed.length !== selected.length) setError('Only PNG, JPG, and JPEG images are accepted.')
    setPhotos((current) => {
      const available = Math.max(0, 8 - current.length)
      return [...current, ...allowed.slice(0, available).map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      }))]
    })
    event.target.value = ''
  }

  function removePhoto(id) {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id)
      if (removed) URL.revokeObjectURL(removed.preview)
      return current.filter((photo) => photo.id !== id)
    })
  }

  function makeCover(id) {
    setPhotos((current) => {
      const cover = current.find((photo) => photo.id === id)
      return cover ? [cover, ...current.filter((photo) => photo.id !== id)] : current
    })
  }

  async function submit(event) {
    event.preventDefault()
    if (!acknowledged || photos.length === 0) return
    setSaving(true)
    setUploadedCount(0)
    setError('')
    try {
      const listingRef = doc(collection(db, 'listings'))
      const sellerName = user.displayName || user.email?.split('@')[0] || 'seller'
      const safeName = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
      const listingFolder = `${safeName(sellerName)}-${safeName(form.title)}-${listingRef.id}`
      const photo_urls = []

      for (const [index, photo] of photos.entries()) {
        const extension = photo.file.type === 'image/png' ? 'png' : 'jpg'
        const photoRef = ref(storage, `listings/${user.uid}/${listingFolder}/${index + 1}-${photo.id}.${extension}`)
        await uploadBytes(photoRef, photo.file, { contentType: photo.file.type })
        photo_urls.push(await getDownloadURL(photoRef))
        setUploadedCount(index + 1)
      }

      await setDoc(listingRef, {
        title: form.title.trim(),
        author: form.author.trim(),
        description: form.description.trim(),
        isbn_sanitized: sanitizeISBN(form.isbn),
        year_published: Number(form.year_published),
        campus: form.campus,
        course_subject: form.course_subject.trim().toUpperCase(),
        course_number: form.course_number.trim().toUpperCase(),
        price: Number(form.price),
        has_code: form.has_code,
        photo_url: photo_urls[0],
        photo_urls,
        seller_id: user.uid,
        status: 'Available',
      })
      onClose()
    } catch (caught) {
      setError(caught.message)
      setSaving(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal listing-form" onSubmit={submit}>
        <div className="modal-head"><div><p className="eyebrow">NEW LISTING</p><h2>Sell your textbook</h2><p className="modal-intro">Clear photos and course details help your book sell faster.</p></div><button type="button" className="close" onClick={onClose}>×</button></div>
        <section className="composer-section">
          <div className="section-title"><span>01</span><div><strong>Photos</strong><small>Add up to 8 · First image is the cover</small></div></div>
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <div className={`photo-preview ${index === 0 ? 'cover-photo' : ''}`} key={photo.id}>
                <img src={photo.preview} alt={`Upload preview ${index + 1}`} />
                {index === 0 && <span>COVER</span>}
                <div className="photo-actions">
                  {index !== 0 && <button type="button" onClick={() => makeCover(photo.id)}>MAKE COVER</button>}
                  <button type="button" onClick={() => removePhoto(photo.id)}>REMOVE</button>
                </div>
              </div>
            ))}
            {photos.length < 8 && (
              <label className="photo-picker">
                <input type="file" accept="image/png, image/jpeg" multiple onChange={addPhotos} />
                <b>＋</b><strong>Add photos</strong><small>PNG, JPG or JPEG</small>
              </label>
            )}
          </div>
        </section>
        <section className="composer-section">
          <div className="section-title"><span>02</span><div><strong>Book details</strong><small>Tell buyers exactly what you have</small></div></div>
          <div className="form-grid">
            <label className="span-2">Book title<input value={form.title} onChange={(e) => field('title', e.target.value)} required /></label>
            <label>Author<input value={form.author} onChange={(e) => field('author', e.target.value)} required /></label>
            <label>ISBN<input inputMode="numeric" value={form.isbn} onChange={(e) => field('isbn', sanitizeISBN(e.target.value))} required /></label>
            <label className="span-2 description-field">Description <span className="optional">Optional</span><textarea maxLength="1500" rows="5" value={form.description} onChange={(e) => field('description', e.target.value)} placeholder="Condition, highlighting, missing pages, edition details, or pickup preferences…" /><small>{form.description.length}/1500</small></label>
            <label>Year published<input type="number" min="1000" max="2100" value={form.year_published} onChange={(e) => field('year_published', e.target.value)} required /></label>
            <label>School <span className="optional">Optional</span><input list="school-options" value={form.campus} onChange={(e) => field('campus', e.target.value)} placeholder="Any school or High School" /></label>
            <label>Course subject<input placeholder="CMPT" value={form.course_subject} onChange={(e) => field('course_subject', e.target.value)} required /></label>
            <label>Course number<input placeholder="101" value={form.course_number} onChange={(e) => field('course_number', e.target.value)} required /></label>
            <label>Price (CAD)<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => field('price', e.target.value)} required /></label>
          </div>
          <label className="check"><input type="checkbox" checked={form.has_code} onChange={(e) => field('has_code', e.target.checked)} /> Includes unused access code</label>
        </section>
        <section className="composer-section legal-section">
          <div className="section-title"><span>03</span><div><strong>Review & publish</strong><small>One last safety check</small></div></div>
          <label className="legal-check"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} required /> I acknowledge this is a physical resale board. I am not selling digital files or pirated content. MyStudentBulletin is a matching service only.</label>
        </section>
        {error && <p className="error">{error}</p>}
        <div className="publish-bar"><span>{photos.length}/8 photos added</span><button className="primary" disabled={saving || !acknowledged || photos.length === 0}>{saving ? `UPLOADING ${uploadedCount}/${photos.length}…` : 'PUBLISH LISTING'}</button></div>
      </form>
    </div>
  )
}

function Chat({ user, listing, conversation, onClose }) {
  const [chatId, setChatId] = useState(conversation?.id || '')
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const isSeller = listing.seller_id === user.uid

  useEffect(() => {
    if (conversation?.id) {
      setChatId(conversation.id)
      return
    }
    if (isSeller) return
    async function ensureChat() {
      try {
        const existing = await getDocs(query(collection(db, 'chats'), where('buyer_id', '==', user.uid)))
        const matchingChat = existing.docs.find((item) => item.data().listing_id === listing.id)
        if (matchingChat) {
          setChatId(matchingChat.id)
          return
        }
        const chatRef = await addDoc(collection(db, 'chats'), {
          listing_id: listing.id,
          buyer_id: user.uid,
          seller_id: listing.seller_id,
          last_message: '',
          updated_at: serverTimestamp(),
        })
        setChatId(chatRef.id)
      } catch (caught) {
        setError(caught.message)
      }
    }
    ensureChat()
  }, [conversation?.id, isSeller, listing.id, listing.seller_id, user.uid])

  useEffect(() => {
    if (!chatId) return undefined
    const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('created_at', 'asc'))
    return onSnapshot(messagesQuery, (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
  }, [chatId])

  async function send(event) {
    event.preventDefault()
    const message_text = text.trim()
    if (!message_text || !chatId) return
    setText('')
    setError('')
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chat_id: chatId,
        sender_id: user.uid,
        message_text,
        created_at: serverTimestamp(),
      })
    } catch (caught) {
      setText(message_text)
      setError(caught.message)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <section className="modal chat">
        <div className="modal-head"><div><p className="eyebrow">RE: {listing.title}</p><h2>{isSeller ? 'Buyer conversation' : 'Message seller'}</h2></div><button className="close" onClick={onClose}>×</button></div>
        <div className="safety">⚠️ Campus Safety Shield: Never send e-transfers/cash before inspecting the physical book in a public campus zone (e.g., SAMU, SUB, MacHall).</div>
        {error && <p className="error chat-error">{error}</p>}
        <div className="messages">
          {!error && messages.length === 0 && <p className="empty">{chatId ? 'No messages yet. Say hello.' : 'Preparing secure chat…'}</p>}
          {messages.map((message) => <p key={message.id} className={message.sender_id === user.uid ? 'mine' : 'theirs'}>{message.message_text}</p>)}
        </div>
        <form className="composer" onSubmit={send}><input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" disabled={!chatId} /><button className="primary" disabled={!chatId}>SEND</button></form>
      </section>
    </div>
  )
}

function ListingDetail({ listing, user, onBack, onMessage }) {
  const photos = listing.photo_urls?.length ? listing.photo_urls : [listing.photo_url]
  const [activePhoto, setActivePhoto] = useState(photos[0])

  return (
    <main className="listing-page">
      <button className="back-button" onClick={onBack}>← BACK TO MARKETPLACE</button>
      <div className="listing-layout">
        <section className="listing-gallery">
          <div className="listing-hero"><img src={activePhoto} alt={listing.title} /></div>
          {photos.length > 1 && <div className="listing-thumbs">{photos.map((photo, index) => <button className={activePhoto === photo ? 'active' : ''} onClick={() => setActivePhoto(photo)} key={photo}><img src={photo} alt={`${listing.title} view ${index + 1}`} /></button>)}</div>}
        </section>
        <aside className="listing-info">
          <p className="course">{listing.course_subject} {listing.course_number}</p>
          <h1>{listing.title}</h1>
          <p className="listing-author">by {listing.author} · {listing.year_published}</p>
          <strong className="listing-price">${Number(listing.price).toFixed(2)}</strong>
          <div className="listing-facts">
            {listing.campus && <div><span>SCHOOL</span><b>{listing.campus}</b></div>}
            <div><span>ISBN</span><b>{listing.isbn_sanitized}</b></div>
            <div><span>ACCESS CODE</span><b>{listing.has_code ? 'Included' : 'Not included'}</b></div>
          </div>
          {listing.description && <div className="listing-description"><span>SELLER DESCRIPTION</span><p>{listing.description}</p></div>}
          {listing.seller_id !== user.uid ? <button className="primary message-cta" onClick={onMessage}>MESSAGE SELLER</button> : <p className="own-listing">This is your listing.</p>}
          <div className="detail-safety">Meet in a public campus location. Inspect the physical book before sending money.</div>
        </aside>
      </div>
    </main>
  )
}

function Inbox({ user, listings, onOpenChat }) {
  const [tab, setTab] = useState('buying')
  const [chats, setChats] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const field = tab === 'buying' ? 'buyer_id' : 'seller_id'
    const chatsQuery = query(collection(db, 'chats'), where(field, '==', user.uid))
    return onSnapshot(chatsQuery, (snapshot) => {
      setChats(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
      setError('')
    }, (caught) => setError(caught.message))
  }, [tab, user.uid])

  return (
    <main className="inbox-page">
      <div className="inbox-heading"><div><p className="eyebrow">YOUR CONVERSATIONS</p><h1>Messages</h1></div><div className="inbox-tabs"><button className={tab === 'buying' ? 'active' : ''} onClick={() => setTab('buying')}>BUYING</button><button className={tab === 'selling' ? 'active' : ''} onClick={() => setTab('selling')}>SELLING</button></div></div>
      <div className="conversation-list">
        {error && <p className="error">{error}</p>}
        {!error && chats.length === 0 && <div className="inbox-empty"><strong>No {tab} conversations yet.</strong><p>{tab === 'buying' ? 'Open a listing to contact its seller.' : 'Buyer messages about your listings will appear here.'}</p></div>}
        {chats.map((chat) => {
          const listing = listings.find((item) => item.id === chat.listing_id)
          if (!listing) return null
          return <button className="conversation-row" key={chat.id} onClick={() => onOpenChat(chat, listing)}><img src={listing.photo_url} alt="" /><div><span>{tab === 'buying' ? 'BUYING' : 'SELLING'}</span><strong>{listing.title}</strong><p>{chat.last_message || 'Open conversation'}</p></div><b>→</b></button>
        })}
      </div>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(undefined)
  const [listings, setListings] = useState([])
  const [campus, setCampus] = useState('')
  const [course, setCourse] = useState('')
  const [isbn, setIsbn] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [activeListing, setActiveListing] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [page, setPage] = useState('market')

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(collection(db, 'listings'), (snapshot) => {
      setListings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
  }, [user])

  const visible = useMemo(() => {
    const courseNeedle = course.trim().replace(/\s+/g, '').toUpperCase()
    const isbnNeedle = sanitizeISBN(isbn)
    return listings.filter((item) => {
      const listingCourse = `${item.course_subject}${item.course_number}`.replace(/\s+/g, '').toUpperCase()
      return item.status === 'Available'
        && (!campus || item.campus === campus)
        && (!courseNeedle || listingCourse.includes(courseNeedle))
        && (!isbnNeedle || sanitizeISBN(item.isbn_sanitized).includes(isbnNeedle))
    })
  }, [listings, campus, course, isbn])

  const institutions = useMemo(() => (
    [...new Set([...SCHOOL_SUGGESTIONS, ...listings.map((item) => item.campus).filter(Boolean)])].sort()
  ), [listings])

  if (user === undefined) return <div className="loading">MYSTUDENTBULLETIN</div>
  if (!user) return <AuthScreen />

  return (
    <>
      <datalist id="school-options">{SCHOOL_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
      <header>
        <button className="brand" onClick={() => { setPage('market'); setActiveListing(null) }}><span className="brand-mark">M</span><span className="brand-name">MyStudentBulletin</span></button>
        <nav><button className={`nav-link ${page === 'chats' ? 'active' : ''}`} onClick={() => { setPage('chats'); setActiveListing(null) }}>CHATS</button><span className="user-email">{user.email}</span><button className="outline" onClick={() => setCreateOpen(true)}>SELL A BOOK</button><button className="logout" onClick={() => signOut(auth)}>LOG OUT</button></nav>
      </header>
      {page === 'chats' ? <Inbox user={user} listings={listings} onOpenChat={(conversation, listing) => setActiveChat({ conversation, listing })} /> : activeListing ? (
        <ListingDetail listing={activeListing} user={user} onBack={() => setActiveListing(null)} onMessage={() => setActiveChat({ listing: activeListing })} />
      ) : <main className="market">
        <aside>
          <p className="eyebrow">THE LOCAL BOOK BOARD</p>
          <h1>Find the book.<br /><em>Skip the markup.</em></h1>
          <p className="aside-copy">Search physical textbooks listed by students near you.</p>
          <label>School<select value={campus} onChange={(e) => setCampus(e.target.value)}><option value="">Any school</option>{institutions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Course code<input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. ECON 101" /></label>
          <label>ISBN<input inputMode="numeric" value={isbn} onChange={(e) => setIsbn(sanitizeISBN(e.target.value))} placeholder="Digits only" /></label>
          <button className="text-button clear" onClick={() => { setCampus(''); setCourse(''); setIsbn('') }}>CLEAR FILTERS</button>
        </aside>
        <section className="results">
          <div className="results-head"><div><p className="eyebrow">FRESH ON THE BOARD</p><h2>{visible.length} {visible.length === 1 ? 'book' : 'books'} available</h2></div><span><i /> IN-PERSON EXCHANGE</span></div>
          <div className="grid">
            {visible.map((listing) => (
              <article className="card" key={listing.id}>
                <div className="image-wrap"><img src={listing.photo_url} alt={`Cover of ${listing.title}`} />{listing.campus && <span>{listing.campus}</span>}<b>AVAILABLE</b></div>
                <div className="card-body"><p className="course">{listing.course_subject} {listing.course_number}</p><h3>{listing.title}</h3><p className="author">{listing.author} · {listing.year_published}</p><div className="price-row"><strong>${Number(listing.price).toFixed(2)}</strong>{listing.has_code && <span>ACCESS CODE</span>}</div><button className="card-action" onClick={() => setActiveListing(listing)}>VIEW FULL LISTING →</button></div>
              </article>
            ))}
          </div>
          {visible.length === 0 && <div className="no-results"><strong>Nothing here yet.</strong><p>Try clearing a filter, or be the first to list a book.</p><button className="primary" onClick={() => setCreateOpen(true)}>SELL A BOOK</button></div>}
        </section>
      </main>}
      {createOpen && <ListingForm user={user} onClose={() => setCreateOpen(false)} />}
      {activeChat && <Chat user={user} listing={activeChat.listing} conversation={activeChat.conversation} onClose={() => setActiveChat(null)} />}
    </>
  )
}

export default App
