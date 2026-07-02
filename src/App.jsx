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
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
  title: '', author: '', isbn: '', year_published: '', campus: '',
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
  const [photo, setPhoto] = useState(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!acknowledged || !photo) return
    setSaving(true)
    setError('')
    try {
      const photoRef = ref(storage, `listings/${user.uid}/${crypto.randomUUID()}-${photo.name}`)
      await uploadBytes(photoRef, photo, { contentType: photo.type })
      const photo_url = await getDownloadURL(photoRef)
      await addDoc(collection(db, 'listings'), {
        title: form.title.trim(),
        author: form.author.trim(),
        isbn_sanitized: sanitizeISBN(form.isbn),
        year_published: Number(form.year_published),
        campus: form.campus,
        course_subject: form.course_subject.trim().toUpperCase(),
        course_number: form.course_number.trim().toUpperCase(),
        price: Number(form.price),
        has_code: form.has_code,
        photo_url,
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
        <div className="modal-head"><div><p className="eyebrow">NEW POST</p><h2>Create listing</h2></div><button type="button" className="close" onClick={onClose}>×</button></div>
        <div className="form-grid">
          <label className="span-2">Book title<input value={form.title} onChange={(e) => field('title', e.target.value)} required /></label>
          <label>Author<input value={form.author} onChange={(e) => field('author', e.target.value)} required /></label>
          <label>ISBN<input inputMode="numeric" value={form.isbn} onChange={(e) => field('isbn', sanitizeISBN(e.target.value))} required /></label>
          <label>Year published<input type="number" min="1000" max="2100" value={form.year_published} onChange={(e) => field('year_published', e.target.value)} required /></label>
          <label>School <span className="optional">Optional</span><input list="school-options" value={form.campus} onChange={(e) => field('campus', e.target.value)} placeholder="Type any school or choose High School" /></label>
          <label>Course subject<input placeholder="CMPT" value={form.course_subject} onChange={(e) => field('course_subject', e.target.value)} required /></label>
          <label>Course number<input placeholder="101" value={form.course_number} onChange={(e) => field('course_number', e.target.value)} required /></label>
          <label>Price (CAD)<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => field('price', e.target.value)} required /></label>
          <label>Book photo<input type="file" accept="image/png, image/jpeg" onChange={(e) => setPhoto(e.target.files[0])} required /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.has_code} onChange={(e) => field('has_code', e.target.checked)} /> Includes unused access code</label>
        <label className="legal-check"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} required /> I acknowledge this is a physical resale board. I am not selling digital files or pirated content. MyStudentBulletin is a matching service only.</label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={saving || !acknowledged}>{saving ? 'PUBLISHING…' : 'PUBLISH LISTING'}</button>
      </form>
    </div>
  )
}

function Chat({ user, listing, onClose }) {
  const [chatId, setChatId] = useState('')
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const isSeller = listing.seller_id === user.uid

  useEffect(() => {
    if (isSeller) return
    const id = `${listing.id}_${user.uid}`
    async function ensureChat() {
      const chatRef = doc(db, 'chats', id)
      if (!(await getDoc(chatRef)).exists()) {
        await setDoc(chatRef, {
          listing_id: listing.id,
          buyer_id: user.uid,
          seller_id: listing.seller_id,
          last_message: '',
          updated_at: serverTimestamp(),
        })
      }
      setChatId(id)
    }
    ensureChat()
  }, [isSeller, listing, user.uid])

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
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      chat_id: chatId,
      sender_id: user.uid,
      message_text,
      created_at: serverTimestamp(),
    })
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <section className="modal chat">
        <div className="modal-head"><div><p className="eyebrow">RE: {listing.title}</p><h2>Seller chat</h2></div><button className="close" onClick={onClose}>×</button></div>
        <div className="safety">⚠️ Campus Safety Shield: Never send e-transfers/cash before inspecting the physical book in a public campus zone (e.g., SAMU, SUB, MacHall).</div>
        {isSeller ? <p className="empty">Open this conversation from your inbox when a buyer contacts you.</p> : (
          <>
            <div className="messages">
              {messages.length === 0 && <p className="empty">No messages yet. Ask if the book is still available.</p>}
              {messages.map((message) => <p key={message.id} className={message.sender_id === user.uid ? 'mine' : 'theirs'}>{message.message_text}</p>)}
            </div>
            <form className="composer" onSubmit={send}><input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" /><button className="primary">SEND</button></form>
          </>
        )}
      </section>
    </div>
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
        <a className="brand" href="/"><span className="brand-mark">M</span><span className="brand-name">MyStudentBulletin</span></a>
        <nav><span className="user-email">{user.email}</span><button className="outline" onClick={() => setCreateOpen(true)}>SELL A BOOK</button><button className="logout" onClick={() => signOut(auth)}>LOG OUT</button></nav>
      </header>
      <main className="market">
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
                <div className="card-body"><p className="course">{listing.course_subject} {listing.course_number}</p><h3>{listing.title}</h3><p className="author">{listing.author} · {listing.year_published}</p><div className="price-row"><strong>${Number(listing.price).toFixed(2)}</strong>{listing.has_code && <span>ACCESS CODE</span>}</div><button className="card-action" onClick={() => setActiveListing(listing)}>{listing.seller_id === user.uid ? 'VIEW LISTING' : 'MESSAGE SELLER'} →</button></div>
              </article>
            ))}
          </div>
          {visible.length === 0 && <div className="no-results"><strong>Nothing here yet.</strong><p>Try clearing a filter, or be the first to list a book.</p><button className="primary" onClick={() => setCreateOpen(true)}>SELL A BOOK</button></div>}
        </section>
      </main>
      {createOpen && <ListingForm user={user} onClose={() => setCreateOpen(false)} />}
      {activeListing && <Chat user={user} listing={activeListing} onClose={() => setActiveListing(null)} />}
    </>
  )
}

export default App
