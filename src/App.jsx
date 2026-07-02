import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from './lib/firebase'
import { sanitizeISBN } from './lib/validation'
import ToS from './legal/ToS'
import Privacy from './legal/Privacy'
import AUP from './legal/AUP'

const SCHOOL_SUGGESTIONS = [
  'University of Alberta', 'MacEwan University', 'NAIT', 'NorQuest College',
  'University of Calgary', 'Mount Royal University', 'SAIT', 'Bow Valley College',
  'High School',
]
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL?.trim().toLowerCase() || ''
const emptyListing = {
  title: '', author: '', description: '', isbn: '', year_published: '', campus: '',
  course_subject: '', course_number: '', price: '', condition: 'Used - Good',
  location: '', pickup_preference: 'Public meetup', has_code: false,
}

function AuthScreen({ onLegal }) {
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [campus, setCampus] = useState('')
  const [error, setError] = useState('')
  const [agreed, setAgreed] = useState(false)

  function validateSignupUsername() {
    const value = signupUsername.trim()
    if (!/^[A-Za-z_]{6,}$/.test(value)) {
      setError('Username must be at least 6 characters and contain only letters or underscores.')
      return null
    }
    return value
  }

  async function createProfileWithUsername(firebaseUser, username, profile) {
    const normalized = username.toLowerCase()
    await runTransaction(db, async (transaction) => {
      const usernameRef = doc(db, 'usernames', normalized)
      const usernameRecord = await transaction.get(usernameRef)
      if (usernameRecord.exists()) throw new Error('That username is already taken.')
      transaction.set(usernameRef, { uid: firebaseUser.uid, username })
      transaction.set(doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        username,
        ...profile,
        created_at: serverTimestamp(),
      })
    })
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    let createdUser = null
    try {
      if (mode === 'signup') {
        const username = validateSignupUsername()
        if (!username) return
        if (!window.confirm(`Create your permanent username @${username}? It cannot be changed later, and inappropriate usernames may be removed.`)) return
        const result = await createUserWithEmailAndPassword(auth, email, password)
        createdUser = result.user
        await updateProfile(result.user, { displayName: `${firstName.trim()} ${lastName.trim()}` })
        await createProfileWithUsername(result.user, username, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          campus,
        })
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (caught) {
      if (createdUser) await deleteUser(createdUser).catch(() => {})
      setError(caught.message.replace('Firebase: ', ''))
    }
  }

  async function googleSignIn() {
    setError('')
    try {
      const username = mode === 'signup' ? validateSignupUsername() : null
      if (mode === 'signup' && !username) return
      if (mode === 'signup' && !window.confirm(`Create your permanent username @${username}? It cannot be changed later, and inappropriate usernames may be removed.`)) return
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const userRef = doc(db, 'users', result.user.uid)
      if (!(await getDoc(userRef)).exists()) {
        if (mode !== 'signup') {
          if (getAdditionalUserInfo(result)?.isNewUser) await deleteUser(result.user)
          throw new Error('Choose “Need an account?” and select a username before creating a Google account.')
        }
        const [given = '', ...family] = (result.user.displayName || '').split(' ')
        try {
          await createProfileWithUsername(result.user, username, {
          first_name: given,
          last_name: family.join(' '),
          display_name: result.user.displayName || 'Student',
          campus: '',
          photo_url: result.user.photoURL || '',
          })
        } catch (caught) {
          if (getAdditionalUserInfo(result)?.isNewUser) await deleteUser(result.user).catch(() => {})
          throw caught
        }
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
        <h1>Study more.<br />Spend less.</h1>
        <p className="muted">A local marketplace for physical textbooks, from high school through university.</p>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <img className="auth-logo" src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" />
        <div>
          <h2>{mode === 'signin' ? 'Welcome back.' : 'Join the board.'}</h2>
        </div>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {mode === 'signup' && (
          <>
            <div className="name-grid"><label>First name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label><label>Last name<input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label></div>
            <label>Username<input value={signupUsername} onChange={(e) => setSignupUsername(e.target.value)} minLength="6" pattern="[A-Za-z_]+" placeholder="student_name" required /><small className="field-help">At least 6 characters. Letters and underscores only. This can only be set once.</small></label>
            <label>School <span className="optional">Optional</span><input list="school-options" value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="College, university, or high school" /></label>
          </>
        )}
        {mode === 'signup' && <label className="terms-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required /><span>I agree to the <button type="button" onClick={() => onLegal('tos')}>Terms of Service</button> and <button type="button" onClick={() => onLegal('privacy')}>Privacy Policy</button>.</span></label>}
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={mode === 'signup' && !agreed}>{mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
        <div className="auth-divider"><span>OR</span></div>
        <button className="google-button" type="button" onClick={googleSignIn} disabled={mode === 'signup' && !agreed}>G&nbsp;&nbsp; CONTINUE WITH GOOGLE</button>
        <button className="text-button" type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Need an account?' : 'Already registered?'}
        </button>
      </form>
    </main>
  )
}

function ListingForm({ user, onClose, standalone = false }) {
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
        condition: form.condition,
        location: form.location.trim(),
        pickup_preference: form.pickup_preference,
        has_code: form.has_code,
        photo_url: photo_urls[0],
        photo_urls,
        seller_id: user.uid,
        status: 'Available',
        approval_status: 'Pending',
        created_at: serverTimestamp(),
      })
      onClose()
    } catch (caught) {
      setError(caught.message)
      setSaving(false)
    }
  }

  return (
    <div className={standalone ? 'listing-page-shell' : 'overlay'} role={standalone ? undefined : 'dialog'} aria-modal={standalone ? undefined : 'true'}>
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
            <label>Condition<select value={form.condition} onChange={(e) => field('condition', e.target.value)}><option>New</option><option>Used - Like new</option><option>Used - Good</option><option>Used - Fair</option></select></label>
            <label>Area <span className="optional">Optional</span><input value={form.location} onChange={(e) => field('location', e.target.value)} placeholder="NW Edmonton, Downtown Calgary…" /></label>
            <label>Preferred pickup<select value={form.pickup_preference} onChange={(e) => field('pickup_preference', e.target.value)}><option>Public meetup</option><option>Campus meetup</option><option>Home pickup</option><option>Flexible</option></select></label>
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

function Chat({ user, listing, conversation, onClose, onProfile, onStatusChange, embedded = false }) {
  const [chatId, setChatId] = useState(conversation?.id || '')
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [safetyVisible, setSafetyVisible] = useState(true)
  const [otherProfile, setOtherProfile] = useState(null)
  const messagesEnd = useRef(null)
  const isSeller = listing.seller_id === user.uid
  const otherUserId = isSeller ? conversation?.buyer_id : listing.seller_id

  useEffect(() => {
    if (!otherUserId) return
    getDoc(doc(db, 'users', otherUserId)).then((snapshot) => setOtherProfile(snapshot.data() || null))
  }, [otherUserId])

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
          buyer_unread: false,
          seller_unread: false,
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
    updateDoc(doc(db, 'chats', chatId), {
      [isSeller ? 'seller_unread' : 'buyer_unread']: false,
    }).catch((caught) => setError(caught.message))
    const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('created_at', 'asc'))
    return onSnapshot(messagesQuery, (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
  }, [chatId, isSeller])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        message_type: 'user',
        reactions: {},
      })
      await updateDoc(doc(db, 'chats', chatId), {
        last_message: message_text,
        updated_at: serverTimestamp(),
        [isSeller ? 'buyer_unread' : 'seller_unread']: true,
      })
    } catch (caught) {
      setText(message_text)
      setError(caught.message)
    }
  }

  async function reactToMessage(message, emoji) {
    await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
      [`reactions.${user.uid}`]: message.reactions?.[user.uid] === emoji ? deleteField() : emoji,
    })
  }

  async function editMessage(message) {
    const created = message.created_at?.toMillis?.() || 0
    if (Date.now() - created > 5 * 60 * 1000) return
    const message_text = window.prompt('Edit message', message.message_text)
    if (!message_text?.trim()) return
    await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
      message_text: message_text.trim(),
      edited_at: serverTimestamp(),
    })
  }

  async function report(kind, target_id, context = '', targetUserId = '') {
    const reason = window.prompt(`Why are you reporting this ${kind}?`)
    if (!reason?.trim()) return
    const targetProfile = targetUserId ? await getDoc(doc(db, 'users', targetUserId)) : null
    await addDoc(collection(db, 'reports'), {
      reporter_id: user.uid,
      reporter_email: user.email,
      report_type: kind,
      target_id,
      target_user_id: targetUserId,
      target_email: targetProfile?.exists() ? targetProfile.data().email : '',
      chat_id: chatId,
      listing_id: listing.id,
      context,
      reason: reason.trim(),
      transcript: messages.map((message) => ({
        sender_id: message.sender_id,
        message_text: message.message_text,
        message_type: message.message_type || 'user',
        created_at: message.created_at?.toDate?.().toISOString() || '',
      })),
      created_at: serverTimestamp(),
      status: 'Open',
    })
    setError('Report submitted. Thank you for helping keep the board safe.')
  }

  let previousDate = ''

  return (
    <div className={embedded ? 'chat-embedded-shell' : 'overlay'} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : 'true'}>
      <section className={embedded ? 'chat chat-page-panel' : 'modal chat'}>
        {embedded ? <div className="chat-context-bar"><img src={listing.photo_url} alt="" /><div><strong>{listing.title}</strong><span>{isSeller ? 'Buyer' : 'Seller'}: {otherProfile?.display_name || otherProfile?.username || 'Student'} · ${Number(listing.price).toFixed(2)}</span></div><button onClick={() => onProfile(otherUserId)}>VIEW PROFILE</button><button className="context-close" onClick={onClose}>×</button></div> : <div className="modal-head"><div><p className="eyebrow">RE: {listing.title}</p><h2>{isSeller ? 'Buyer conversation' : 'Message seller'}</h2><div className="chat-header-actions"><button className="chat-profile-link" onClick={() => onProfile(otherUserId)}>VIEW {isSeller ? 'BUYER' : 'SELLER'} PROFILE</button><button className="report-link" onClick={() => report('user', otherUserId, '', otherUserId)}>REPORT USER</button></div></div><button className="close" onClick={onClose}>×</button></div>}
        {safetyVisible && <div className="safety">⚠️ Never send money before inspecting the physical book in a public campus location.<button aria-label="Dismiss safety warning" onClick={() => setSafetyVisible(false)}>×</button></div>}
        {isSeller && <div className="chat-listing-status"><span>LISTING: {listing.status}</span><button onClick={() => onStatusChange(listing, 'Pending')}>MARK PENDING</button><button onClick={() => onStatusChange(listing, 'Sold')}>MARK SOLD</button></div>}
        {error && <p className="error chat-error">{error}</p>}
        <div className="messages">
          {!error && messages.length === 0 && <p className="empty">{chatId ? 'No messages yet. Say hello.' : 'Preparing secure chat…'}</p>}
          {messages.map((message) => {
            const date = message.created_at?.toDate?.().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) || ''
            const showDate = date && date !== previousDate
            previousDate = date || previousDate
            const mine = message.sender_id === user.uid
            const canEdit = mine && message.message_type !== 'system' && Date.now() - (message.created_at?.toMillis?.() || 0) <= 5 * 60 * 1000
            return <div className={`message-block ${message.message_type === 'system' ? 'system-message' : mine ? 'mine' : 'theirs'}`} key={message.id}>
              {showDate && <div className="date-divider"><span>{date}</span></div>}
              {message.message_type === 'system' ? <p>{message.message_text}</p> : <><div className="message-bubble"><p>{message.message_text}</p><small>{message.created_at?.toDate?.().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{message.edited_at && ' · edited'}</small></div><div className="message-tools">{['❤️', '👍', '😂'].map((emoji) => <button className={message.reactions?.[user.uid] === emoji ? 'active' : ''} key={emoji} onClick={() => reactToMessage(message, emoji)}>{emoji}</button>)}{canEdit && <button onClick={() => editMessage(message)}>EDIT</button>}{!mine && <button onClick={() => report('message', message.id, message.message_text, message.sender_id)}>REPORT</button>}</div>{Object.values(message.reactions || {}).length > 0 && <div className="reaction-pill">{Object.values(message.reactions).join(' ')}</div>}</>}
            </div>
          })}
          <div ref={messagesEnd} />
        </div>
        <form className="composer" onSubmit={send}><input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" disabled={!chatId} /><button className="primary" disabled={!chatId}>SEND</button></form>
      </section>
    </div>
  )
}

function ListingDetail({ listing, user, onBack, onMessage, onProfile, onStatusChange }) {
  const photos = listing.photo_urls?.length ? listing.photo_urls : [listing.photo_url]
  const [activePhoto, setActivePhoto] = useState(photos[0])
  const activeIndex = photos.indexOf(activePhoto)
  const showPhoto = (offset) => setActivePhoto(photos[(activeIndex + offset + photos.length) % photos.length])

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'ArrowLeft') showPhoto(-1)
      if (event.key === 'ArrowRight') showPhoto(1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  return (
    <main className="listing-page">
      <button className="back-button" onClick={onBack}>← BACK TO MARKETPLACE</button>
      <div className="listing-layout">
        <section className="listing-gallery">
          <div className="listing-hero"><img src={activePhoto} alt={listing.title} />{photos.length > 1 && <><button className="gallery-arrow left" aria-label="Previous image" onClick={() => showPhoto(-1)}>‹</button><button className="gallery-arrow right" aria-label="Next image" onClick={() => showPhoto(1)}>›</button><span className="photo-count">{activeIndex + 1} / {photos.length}</span></>}</div>
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
            <div><span>CONDITION</span><b>{listing.condition || 'Not specified'}</b></div>
            <div><span>AREA</span><b>{listing.location || 'Ask seller'}</b></div>
            <div><span>PICKUP</span><b>{listing.pickup_preference || 'Ask seller'}</b></div>
            <div><span>ACCESS CODE</span><b>{listing.has_code ? 'Included' : 'Not included'}</b></div>
          </div>
          {listing.description && <div className="listing-description"><span>SELLER DESCRIPTION</span><p>{listing.description}</p></div>}
          <button className="profile-link" onClick={() => onProfile(listing.seller_id)}>VIEW SELLER PROFILE</button>
          {listing.seller_id !== user.uid ? <button className="primary message-cta" onClick={onMessage}>MESSAGE SELLER</button> : <div className="owner-status-controls"><span>YOUR LISTING: {listing.status}</span><button onClick={() => onStatusChange(listing, 'Pending')}>MARK PENDING</button><button onClick={() => onStatusChange(listing, 'Sold')}>MARK SOLD</button></div>}
          <div className="detail-safety">Meet in a public campus location. Inspect the physical book before sending money.</div>
        </aside>
      </div>
    </main>
  )
}

function Profile({ userId, listings, onClose, standalone = false }) {
  const [profile, setProfile] = useState(null)
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    getDoc(doc(db, 'users', userId)).then((snapshot) => setProfile(snapshot.exists() ? snapshot.data() : { display_name: 'Student' }))
    return onSnapshot(query(collection(db, 'reviews'), where('reviewee_id', '==', userId)), (snapshot) => setReviews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
  }, [userId])

  const selling = listings.filter((listing) => listing.seller_id === userId && listing.status === 'Available' && listing.approval_status === 'Approved')
  const approvedReviews = reviews.filter((review) => review.approval_status === 'Approved')
  const average = approvedReviews.length ? approvedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / approvedReviews.length : 0

  return <div className={standalone ? 'public-profile-page' : 'overlay'} role={standalone ? undefined : 'dialog'} aria-modal={standalone ? undefined : 'true'}><section className={standalone ? 'profile-modal public-profile-card' : 'modal profile-modal'}><button className="close" onClick={onClose}>×</button><div className="profile-avatar">{(profile?.display_name || 'S').charAt(0)}</div><p className="eyebrow">STUDENT PROFILE</p><h2>{profile?.display_name || 'Student'}</h2><p className="profile-school">{profile?.campus || 'School not listed'}</p><div className="profile-stats"><div><strong>{average ? average.toFixed(1) : 'N/A'}</strong><span>RATING</span></div><div><strong>{approvedReviews.length}</strong><span>REVIEWS</span></div><div><strong>{selling.length}</strong><span>FOR SALE</span></div></div><h3>Currently selling</h3><div className="profile-listings">{selling.length ? selling.map((item) => <div key={item.id}><img src={item.photo_url} alt="" /><span>{item.title}</span><b>${Number(item.price).toFixed(2)}</b></div>) : <p className="empty">No active listings.</p>}</div><h3>Reviews</h3><div className="review-list">{approvedReviews.length ? approvedReviews.map((review) => <article key={review.id}><b>{'★'.repeat(Math.round(review.rating))}</b><p>{review.comment}</p></article>) : <p className="empty">No reviews yet.</p>}</div></section></div>
}

function MyProfile({ user, listings, onStatusChange }) {
  const [profile, setProfile] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewTab, setReviewTab] = useState('seller')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [username, setUsername] = useState('')
  const [campus, setCampus] = useState('')

  useEffect(() => onSnapshot(doc(db, 'users', user.uid), (snapshot) => setProfile(snapshot.data())), [user.uid])
  useEffect(() => onSnapshot(query(collection(db, 'reviews'), where('reviewee_id', '==', user.uid)), (snapshot) => setReviews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [user.uid])

  async function uploadAvatar(event) {
    const file = event.target.files[0]
    if (!file || !['image/png', 'image/jpeg'].includes(file.type)) return
    const avatarRef = ref(storage, `profiles/${user.uid}/avatar.${file.type === 'image/png' ? 'png' : 'jpg'}`)
    await uploadBytes(avatarRef, file, { contentType: file.type })
    const photo_url = await getDownloadURL(avatarRef)
    await Promise.all([setDoc(doc(db, 'users', user.uid), { photo_url }, { merge: true }), updateProfile(user, { photoURL: photo_url })])
  }

  async function addPassword(event) {
    event.preventDefault()
    try {
      await linkWithCredential(user, EmailAuthProvider.credential(user.email, password))
      setPassword('')
      setNotice('Password sign-in has been added to your account.')
    } catch (caught) {
      setNotice(caught.message)
    }
  }

  async function editReview(review) {
    const comment = window.prompt('Update your review', review.comment || '')
    if (comment === null) return
    await updateDoc(doc(db, 'reviews', review.id), { comment: comment.trim(), edited_at: serverTimestamp() })
  }

  useEffect(() => {
    setUsername(profile?.username || '')
  }, [profile?.username])

  useEffect(() => {
    setCampus(profile?.campus || '')
  }, [profile?.campus])

  async function saveUsername(event) {
    event.preventDefault()
    if (profile?.username) {
      setNotice('Your username has already been set and cannot be changed.')
      return
    }
    const value = username.trim()
    if (!/^[A-Za-z_]{6,}$/.test(value)) {
      setNotice('Username must be at least 6 characters and use letters or underscores only.')
      return
    }
    const confirmed = window.confirm(`Set your username to @${value}?\n\nUsernames can only be set once and cannot be changed later. Inappropriate usernames may be removed by moderation.`)
    if (!confirmed) return
    const normalized = value.toLowerCase()
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid)
        const newUsernameRef = doc(db, 'usernames', normalized)
        const newUsername = await transaction.get(newUsernameRef)
        if (newUsername.exists() && newUsername.data().uid !== user.uid) throw new Error('That username is already taken.')
        transaction.set(newUsernameRef, { uid: user.uid, username: value })
        transaction.set(userRef, { username: value }, { merge: true })
      })
      setNotice('Username set successfully. It can no longer be changed.')
    } catch (caught) {
      setNotice(caught.message)
    }
  }

  async function saveSchool(event) {
    event.preventDefault()
    await updateDoc(doc(db, 'users', user.uid), { campus: campus.trim() })
    setNotice('School updated.')
  }

  const received = reviews.filter((review) => review.approval_status === 'Approved' && (review.role || 'seller') === reviewTab)
  const active = listings.filter((item) => item.seller_id === user.uid && item.status !== 'Sold')
  const sold = listings.filter((item) => item.seller_id === user.uid && item.status === 'Sold')
  const hasPassword = user.providerData.some((provider) => provider.providerId === 'password')

  return <main className="my-profile-page">
    <section className="profile-hero">
      <div className="profile-photo-wrap">{profile?.photo_url || user.photoURL ? <img src={profile?.photo_url || user.photoURL} alt="" /> : <span>{(profile?.display_name || user.displayName || 'S').charAt(0)}</span>}<label><input type="file" accept="image/png, image/jpeg" onChange={uploadAvatar} />CHANGE PHOTO</label></div>
      <div><p className="eyebrow">YOUR PROFILE</p><h1>{profile?.display_name || user.displayName || 'Student'}</h1>{profile?.username && <p className="profile-username">@{profile.username}</p>}<p>{profile?.campus || 'No school selected'} · {user.email}</p></div>
    </section>
    <section className="identity-card"><div><label>First name<input value={profile?.first_name || ''} readOnly /></label><label>Last name<input value={profile?.last_name || ''} readOnly /></label><label>Email<input value={user.email || ''} readOnly /></label></div><div className="editable-profile-fields"><form onSubmit={saveUsername}><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} minLength="6" pattern="[A-Za-z_]+" placeholder="student_name" readOnly={Boolean(profile?.username)} required /></label><small>{profile?.username ? 'Your username is permanent. Inappropriate usernames may be removed by moderation.' : 'At least 6 characters. Letters and underscores only. Choose carefully. Your username can only be set once.'}</small>{!profile?.username && <button className="primary">SET USERNAME</button>}</form><form onSubmit={saveSchool}><label>School<input list="school-options" value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="Choose or type your school" /></label><small>Choose a suggestion or enter your school manually.</small><button className="primary">SAVE SCHOOL</button></form></div></section>
    {!hasPassword && <form className="password-card" onSubmit={addPassword}><div><strong>Add password sign-in</strong><p>Your Google account remains connected. This adds email/password as another sign-in method.</p></div><input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required /><button className="primary">ADD PASSWORD</button></form>}
    {notice && <p className="profile-notice">{notice}</p>}
    <section className="profile-dashboard"><div className="profile-section-head"><h2>Your listings</h2><span>{active.length} active · {sold.length} sold</span></div><div className="dashboard-listings">{[...active, ...sold].map((item) => <article key={item.id}><img src={item.photo_url} alt="" /><div><span>{item.status}</span><strong>{item.title}</strong><p>${Number(item.price).toFixed(2)} · {item.condition || 'Condition not set'}</p></div><select value={item.status} onChange={(e) => onStatusChange(item, e.target.value)}><option>Available</option><option>Pending</option><option>Sold</option></select></article>)}</div></section>
    <section className="profile-dashboard"><div className="profile-section-head"><h2>Your reviews</h2><div className="review-tabs"><button className={reviewTab === 'seller' ? 'active' : ''} onClick={() => setReviewTab('seller')}>AS SELLER</button><button className={reviewTab === 'buyer' ? 'active' : ''} onClick={() => setReviewTab('buyer')}>AS BUYER</button></div></div><div className="received-reviews">{received.length ? received.map((review) => <article key={review.id}><b>{'★'.repeat(Math.round(review.rating))}</b><p>{review.comment}</p></article>) : <p className="empty">No {reviewTab} reviews yet.</p>}</div></section>
    <section className="profile-dashboard"><div className="profile-section-head"><h2>Reviews you wrote</h2></div><WrittenReviews user={user} onEdit={editReview} /></section>
  </main>
}

function WrittenReviews({ user, onEdit }) {
  const [reviews, setReviews] = useState([])
  useEffect(() => onSnapshot(query(collection(db, 'reviews'), where('reviewer_id', '==', user.uid)), (snapshot) => setReviews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [user.uid])
  return <div className="received-reviews">{reviews.length ? reviews.map((review) => <article key={review.id}><b>{'★'.repeat(Math.round(review.rating))}</b><p>{review.comment}</p><button onClick={() => onEdit(review)}>EDIT REVIEW</button></article>) : <p className="empty">You have not written any reviews.</p>}</div>
}

function Footer() {
  return <footer><a className="footer-brand" href="/"><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /></a><nav><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a><a href="/acceptable-use/">Acceptable Use</a></nav></footer>
}

function WelcomePage({ user }) {
  return <main className="welcome-page">
    <nav className="welcome-nav"><a href="/"><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /></a><div><a href="/terms/">POLICIES</a>{user ? <><a href="/marketplace/">MARKETPLACE</a><a className="welcome-button" href="/profile/">MY PROFILE</a></> : <><a href="/login/">SIGN IN</a><a className="welcome-button" href="/login/?mode=signup">JOIN THE BOARD</a></>}</div></nav>
    <section className="welcome-hero"><div><p className="eyebrow">A STUDENT TEXTBOOK BULLETIN</p><h1>Books cost enough.<br /><em>Buying them shouldn’t.</em></h1><p>Find physical textbooks from students near you, list books you no longer need, and arrange safe local pickup without marketplace clutter.</p><div className="welcome-actions">{user ? <a className="primary" href="/marketplace/">BROWSE THE MARKETPLACE</a> : <><a className="primary" href="/login/?mode=signup">CREATE AN ACCOUNT</a><a href="/login/">I ALREADY HAVE AN ACCOUNT</a></>}</div></div><img src="/sticky-note.png" alt="" /></section>
    <section className="welcome-features"><article><span>01</span><h2>List the exact book</h2><p>Course code, ISBN, condition, photos, location, and pickup preference.</p></article><article><span>02</span><h2>Talk directly</h2><p>Private student messaging with safety reminders and reporting tools.</p></article><article><span>03</span><h2>Meet safely</h2><p>Inspect the physical book in a public place before sending payment.</p></article></section>
    <Footer />
  </main>
}

function AdminDashboard({ user }) {
  const [tab, setTab] = useState('listings')
  const [listings, setListings] = useState([])
  const [reviews, setReviews] = useState([])
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])

  useEffect(() => onSnapshot(collection(db, 'listings'), (snapshot) => setListings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [])
  useEffect(() => onSnapshot(collection(db, 'reviews'), (snapshot) => setReviews(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [])
  useEffect(() => onSnapshot(collection(db, 'reports'), (snapshot) => setReports(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [])
  useEffect(() => onSnapshot(collection(db, 'users'), (snapshot) => setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))), [])

  const pendingListings = listings.filter((item) => (item.approval_status || 'Pending') === 'Pending')
  const pendingReviews = reviews.filter((item) => (item.approval_status || 'Pending') === 'Pending')
  const openReports = reports.filter((item) => item.status !== 'Resolved')
  const formatDate = (timestamp) => timestamp?.toDate?.().toLocaleString() || 'Pending timestamp'

  async function editUserSchool(profile) {
    const campus = window.prompt('Update school', profile.campus || '')
    if (campus === null) return
    await updateDoc(doc(db, 'users', profile.id), { campus: campus.trim() })
  }

  async function removeUsername(profile) {
    if (!profile.username || !window.confirm(`Remove @${profile.username}? The user will be able to choose a new username.`)) return
    await runTransaction(db, async (transaction) => {
      const usernameRef = doc(db, 'usernames', profile.username.toLowerCase())
      const usernameRecord = await transaction.get(usernameRef)
      if (usernameRecord.exists() && usernameRecord.data().uid === profile.id) transaction.delete(usernameRef)
      transaction.update(doc(db, 'users', profile.id), { username: deleteField() })
    })
  }

  return <main className="admin-shell">
    <header className="admin-header"><div><img className="admin-logo" src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /><h1>Admin desk</h1></div><div><span>{user.email}</span><button onClick={() => signOut(auth)}>SIGN OUT</button></div></header>
    <nav className="admin-tabs"><button className={tab === 'listings' ? 'active' : ''} onClick={() => setTab('listings')}>LISTINGS <b>{pendingListings.length}</b></button><button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}>REVIEWS <b>{pendingReviews.length}</b></button><button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>REPORTS <b>{openReports.length}</b></button><button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>USERS <b>{users.length}</b></button></nav>
    {tab === 'listings' && <section className="admin-queue">{listings.length ? listings.map((listing) => <article className="admin-card" key={listing.id}><img src={listing.photo_url} alt="" /><div className="admin-card-content"><div className="admin-meta"><span>{listing.approval_status || 'Pending'}</span><span>{listing.status}</span><span>{listing.campus || 'No school'}</span></div><h2>{listing.title}</h2><p>{listing.author} · {listing.year_published} · ISBN {listing.isbn_sanitized}</p><p><b>{listing.course_subject} {listing.course_number}</b> · {listing.condition} · ${Number(listing.price).toFixed(2)}</p><p className="admin-description">{listing.description || 'No description provided.'}</p><small>Seller UID: {listing.seller_id}</small><div className="admin-actions"><button onClick={() => updateDoc(doc(db, 'listings', listing.id), { approval_status: 'Approved' })}>APPROVE</button><button onClick={() => updateDoc(doc(db, 'listings', listing.id), { approval_status: 'Rejected' })}>REJECT</button></div></div></article>) : <p className="admin-empty">No listings submitted.</p>}</section>}
    {tab === 'reviews' && <section className="admin-queue">{reviews.length ? reviews.map((review) => <article className="admin-card review-admin-card" key={review.id}><div className="admin-card-content"><div className="admin-meta"><span>{review.approval_status || 'Pending'}</span><span>{review.role || 'seller'} review</span></div><h2>{'★'.repeat(Math.round(review.rating || 0))}</h2><p className="admin-description">{review.comment}</p><small>From {review.reviewer_id} → {review.reviewee_id}</small><div className="admin-actions"><button onClick={() => updateDoc(doc(db, 'reviews', review.id), { approval_status: 'Approved' })}>APPROVE</button><button onClick={() => updateDoc(doc(db, 'reviews', review.id), { approval_status: 'Rejected' })}>REJECT</button></div></div></article>) : <p className="admin-empty">No reviews submitted.</p>}</section>}
    {tab === 'reports' && <section className="admin-queue">{reports.length ? reports.map((report) => <details className="report-card" key={report.id}><summary><div><span>{report.status || 'Open'}</span><strong>{report.report_type?.toUpperCase()} REPORT</strong><p>{report.target_email || report.target_user_id || report.target_id}</p></div><time>{formatDate(report.created_at)}</time></summary><div className="report-body"><dl><dt>Reported user</dt><dd>{report.target_email || 'Unknown email'} ({report.target_user_id || 'No UID'})</dd><dt>Reporter</dt><dd>{report.reporter_email || report.reporter_id}</dd><dt>Reason</dt><dd>{report.reason}</dd><dt>Context</dt><dd>{report.context || 'No additional context'}</dd><dt>Listing</dt><dd>{report.listing_id || 'N/A'}</dd></dl><h3>Chat transcript</h3><div className="admin-transcript">{report.transcript?.length ? report.transcript.map((message, index) => <div key={`${message.created_at}-${index}`}><span>{message.sender_id}</span><p>{message.message_text}</p><time>{message.created_at || 'Unknown time'}</time></div>) : <p>No transcript was available.</p>}</div><button className="resolve-button" onClick={() => updateDoc(doc(db, 'reports', report.id), { status: 'Resolved', resolved_at: serverTimestamp() })}>MARK RESOLVED</button></div></details>) : <p className="admin-empty">No reports submitted.</p>}</section>}
    {tab === 'users' && <section className="admin-queue admin-users">{users.length ? users.map((profile) => <article className="admin-user-card" key={profile.id}><div className="admin-user-avatar">{profile.photo_url ? <img src={profile.photo_url} alt="" /> : (profile.display_name || profile.first_name || 'S').charAt(0)}</div><div><strong>{profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unnamed user'}</strong><span>{profile.username ? `@${profile.username}` : 'No username set'}</span><p>{profile.email || 'No email'} · {profile.campus || 'No school selected'}</p><small>UID: {profile.uid || profile.id}</small></div><div className="admin-user-actions"><button onClick={() => editUserSchool(profile)}>EDIT SCHOOL</button>{profile.username && <button onClick={() => removeUsername(profile)}>REMOVE USERNAME</button>}</div></article>) : <p className="admin-empty">No users found.</p>}</section>}
  </main>
}

function AdminAccessDenied() {
  return <main className="admin-denied"><strong>403</strong><h1>Admin access only.</h1><p>This account is not authorized to access the moderation dashboard.</p><button className="primary" onClick={() => signOut(auth)}>SIGN OUT</button></main>
}

function Inbox({ listings, activeChat, onOpenChat, buyingChats, sellingChats, user, onProfile, onStatusChange }) {
  const [tab, setTab] = useState('buying')
  const chats = tab === 'buying' ? buyingChats : sellingChats

  return (
    <main className="chat-workspace">
      <aside className="chat-sidebar">
        <div className="inbox-heading"><div><p className="eyebrow">YOUR CONVERSATIONS</p><h1>Messages</h1></div><div className="inbox-tabs"><button className={tab === 'buying' ? 'active' : ''} onClick={() => setTab('buying')}>BUYING</button><button className={tab === 'selling' ? 'active' : ''} onClick={() => setTab('selling')}>SELLING</button></div></div>
        <div className="conversation-list">
        {chats.length === 0 && <div className="inbox-empty"><strong>No {tab} conversations yet.</strong><p>{tab === 'buying' ? 'Open a listing to contact its seller.' : 'Buyer messages about your listings will appear here.'}</p></div>}
        {chats.map((chat) => {
          const listing = listings.find((item) => item.id === chat.listing_id)
          if (!listing) return null
          const unread = tab === 'buying' ? chat.buyer_unread : chat.seller_unread
          return <button className={`conversation-row ${unread ? 'unread' : ''}`} key={chat.id} onClick={() => onOpenChat(chat, listing)}><img src={listing.photo_url} alt="" /><div><span>{tab === 'buying' ? 'BUYING' : 'SELLING'}</span><strong>{listing.title}</strong><p>{chat.last_message || 'Open conversation'}</p></div>{unread && <i>NEW</i>}<b>→</b></button>
        })}
        </div>
      </aside>
      <section className="workspace-thread">
        {activeChat ? <Chat embedded user={user} listing={activeChat.listing} conversation={activeChat.conversation} onClose={() => onOpenChat(null)} onProfile={onProfile} onStatusChange={onStatusChange} /> : <div className="select-chat"><img src="/sticky-note.png" alt="" /><strong>Select a conversation</strong><p>Your messages will appear here.</p></div>}
      </section>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(undefined)
  const [listings, setListings] = useState([])
  const [campus, setCampus] = useState('')
  const [course, setCourse] = useState('')
  const [isbn, setIsbn] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [activeListing, setActiveListing] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const page = pathname === '/login' ? 'login'
    : pathname === '/marketplace' ? 'market'
      : pathname === '/listing' ? 'listing'
      : pathname === '/sell' ? 'sell'
        : pathname === '/chats' ? 'chats'
          : pathname === '/profile' ? 'profile'
            : pathname === '/user' ? 'user'
            : pathname === '/admin' ? 'admin'
              : pathname === '/terms' ? 'tos'
                : pathname === '/privacy' ? 'privacy'
                  : pathname === '/acceptable-use' ? 'aup'
                    : 'home'
  const [buyingChats, setBuyingChats] = useState([])
  const [sellingChats, setSellingChats] = useState([])
  const [profileId, setProfileId] = useState('')

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page, activeListing?.id])

  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(collection(db, 'listings'), (snapshot) => {
      setListings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
  }, [user])

  useEffect(() => {
    if (page !== 'listing' || !listings.length) return
    const listingId = new URLSearchParams(window.location.search).get('id')
    setActiveListing(listings.find((item) => item.id === listingId) || null)
  }, [page, listings])

  useEffect(() => {
    if (page === 'user') setProfileId(new URLSearchParams(window.location.search).get('id') || '')
  }, [page])

  useEffect(() => {
    if (!user) return undefined
    const unsubscribeBuying = onSnapshot(query(collection(db, 'chats'), where('buyer_id', '==', user.uid)), (snapshot) => setBuyingChats(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
    const unsubscribeSelling = onSnapshot(query(collection(db, 'chats'), where('seller_id', '==', user.uid)), (snapshot) => setSellingChats(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
    return () => { unsubscribeBuying(); unsubscribeSelling() }
  }, [user])

  useEffect(() => {
    if (page !== 'chats' || !listings.length) return
    const params = new URLSearchParams(window.location.search)
    const chatId = params.get('chat')
    const listingId = params.get('listing')
    if (chatId) {
      const conversation = [...buyingChats, ...sellingChats].find((chat) => chat.id === chatId)
      const listing = conversation && listings.find((item) => item.id === conversation.listing_id)
      if (conversation && listing) setActiveChat({ conversation, listing })
    } else if (listingId) {
      const listing = listings.find((item) => item.id === listingId)
      if (listing) setActiveChat({ listing })
    }
  }, [page, listings, buyingChats, sellingChats])

  const unreadChats = buyingChats.filter((chat) => chat.buyer_unread).length + sellingChats.filter((chat) => chat.seller_unread).length

  async function changeListingStatus(listing, status) {
    if (listing.seller_id !== user.uid || listing.status === status) return
    await updateDoc(doc(db, 'listings', listing.id), { status })
    setActiveListing((current) => current?.id === listing.id ? { ...current, status } : current)
    setActiveChat((current) => current?.listing?.id === listing.id ? { ...current, listing: { ...current.listing, status } } : current)
    const ownedChats = await getDocs(query(collection(db, 'chats'), where('seller_id', '==', user.uid)))
    const relatedChats = ownedChats.docs.filter((item) => item.data().listing_id === listing.id)
    await Promise.all(relatedChats.map(async (chatDoc) => {
      await addDoc(collection(db, 'chats', chatDoc.id, 'messages'), {
        chat_id: chatDoc.id,
        sender_id: user.uid,
        message_type: 'system',
        message_text: `Listing marked ${status.toLowerCase()}.`,
        created_at: serverTimestamp(),
      })
      await updateDoc(chatDoc.ref, {
        last_message: `Listing marked ${status.toLowerCase()}.`,
        updated_at: serverTimestamp(),
        buyer_unread: true,
      })
    }))
  }

  const visible = useMemo(() => {
    const courseNeedle = course.trim().replace(/\s+/g, '').toUpperCase()
    const isbnNeedle = sanitizeISBN(isbn)
    const filtered = listings.filter((item) => {
      const listingCourse = `${item.course_subject}${item.course_number}`.replace(/\s+/g, '').toUpperCase()
      return item.status !== 'Sold'
        && item.approval_status === 'Approved'
        && (!campus || item.campus === campus)
        && (!courseNeedle || listingCourse.includes(courseNeedle))
        && (!isbnNeedle || sanitizeISBN(item.isbn_sanitized).includes(isbnNeedle))
    })
    return filtered.sort((a, b) => {
      if (sortBy === 'price-low') return Number(a.price) - Number(b.price)
      if (sortBy === 'price-high') return Number(b.price) - Number(a.price)
      return (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0)
    })
  }, [listings, campus, course, isbn, sortBy])

  const institutions = useMemo(() => (
    [...new Set([...SCHOOL_SUGGESTIONS, ...listings.map((item) => item.campus).filter(Boolean)])].sort()
  ), [listings])

  if (user === undefined) return <div className="loading"><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /></div>
  if (page === 'home') return <WelcomePage user={user} />
  if (page === 'tos') return <><ToS onBack={() => window.location.assign('/')} /><Footer /></>
  if (page === 'privacy') return <><Privacy onBack={() => window.location.assign('/')} /><Footer /></>
  if (page === 'aup') return <><AUP onBack={() => window.location.assign('/')} /><Footer /></>
  if (!user && page !== 'login') {
    window.location.replace(`/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    return <div className="loading"><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /></div>
  }
  if (!user) return <><AuthScreen onLegal={(target) => window.location.assign(target === 'tos' ? '/terms/' : '/privacy/')} /><Footer /></>
  if (page === 'login') {
    const next = new URLSearchParams(window.location.search).get('next') || '/marketplace/'
    window.location.replace(next.startsWith('/') ? next : '/')
    return <div className="loading"><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /></div>
  }
  if (page === 'admin') return user.email?.toLowerCase() === ADMIN_EMAIL ? <AdminDashboard user={user} /> : <AdminAccessDenied />

  return (
    <>
      <datalist id="school-options">{SCHOOL_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
      <header>
        <a className="brand" href="/"><img src="/mystudentbulletin-brand.png" alt="MyStudentBulletin" /></a>
        <nav><a className={`nav-link ${page === 'market' ? 'active' : ''}`} href="/marketplace/">MARKETPLACE</a><a className={`nav-link chat-nav ${page === 'chats' ? 'active' : ''}`} href="/chats/">CHATS{unreadChats > 0 && <b>{unreadChats}</b>}</a><a className={`nav-link ${page === 'profile' ? 'active' : ''}`} href="/profile/">PROFILE</a><span className="user-email">{user.displayName || user.email}</span><a className="outline" href="/sell/">SELL A BOOK</a><button className="logout" onClick={async () => { await signOut(auth); window.location.assign('/login/') }}>LOG OUT</button></nav>
      </header>
      {page === 'sell' ? <ListingForm standalone user={user} onClose={() => window.location.assign('/marketplace/')} /> : page === 'profile' ? <MyProfile user={user} listings={listings} onStatusChange={changeListingStatus} /> : page === 'user' ? (profileId ? <Profile standalone userId={profileId} listings={listings} onClose={() => window.location.assign('/')} /> : <main className="page-message"><h1>User not found.</h1></main>) : page === 'chats' ? <Inbox user={user} listings={listings} buyingChats={buyingChats} sellingChats={sellingChats} activeChat={activeChat} onOpenChat={(conversation) => window.location.assign(conversation ? `/chats/?chat=${conversation.id}` : '/chats/')} onProfile={(id) => window.location.assign(`/user/?id=${id}`)} onStatusChange={changeListingStatus} /> : page === 'listing' ? (
        activeListing ? <ListingDetail listing={activeListing} user={user} onBack={() => window.location.assign('/marketplace/')} onMessage={() => window.location.assign(`/chats/?listing=${activeListing.id}`)} onProfile={(id) => window.location.assign(`/user/?id=${id}`)} onStatusChange={changeListingStatus} /> : <main className="page-message"><h1>Listing not found.</h1><a href="/marketplace/">Back to marketplace</a></main>
      ) : <main className="market">
        <aside>
          <p className="eyebrow">THE LOCAL BOOK BOARD</p>
          <h1>Find the book.<br /><em>Skip the markup.</em></h1>
          <p className="aside-copy">Search physical textbooks listed by students near you.</p>
          <label>School<select value={campus} onChange={(e) => setCampus(e.target.value)}><option value="">Any school</option>{institutions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Course code<input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. ECON 101" /></label>
          <label>ISBN<input inputMode="numeric" value={isbn} onChange={(e) => setIsbn(sanitizeISBN(e.target.value))} placeholder="Digits only" /></label>
          <label>Sort by<select value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
          <button className="text-button clear" onClick={() => { setCampus(''); setCourse(''); setIsbn('') }}>CLEAR FILTERS</button>
        </aside>
        <section className="results">
          <div className="results-head"><div><p className="eyebrow">FRESH ON THE BOARD</p><h2>{visible.length} {visible.length === 1 ? 'book' : 'books'} available</h2></div></div>
          <div className="grid">
            {visible.map((listing) => (
              <article className="card" key={listing.id}>
                <div className="image-wrap"><img src={listing.photo_url} alt={`Cover of ${listing.title}`} />{listing.campus && <span>{listing.campus}</span>}<b>{listing.status.toUpperCase()}</b></div>
                <div className="card-body"><p className="course">{listing.course_subject} {listing.course_number}</p><h3>{listing.title}</h3><p className="author">{listing.author} · {listing.year_published}{listing.location ? ` · ${listing.location}` : ''}</p><div className="price-row"><strong>${Number(listing.price).toFixed(2)}</strong>{listing.has_code && <span>ACCESS CODE</span>}</div><a className="card-action" href={`/listing/?id=${listing.id}`}>VIEW FULL LISTING →</a></div>
              </article>
            ))}
          </div>
          {visible.length === 0 && <div className="no-results"><strong>Nothing here yet.</strong><p>Try clearing a filter, or be the first to list a book.</p><a className="primary" href="/sell/">SELL A BOOK</a></div>}
        </section>
      </main>}
      <Footer />
    </>
  )
}

export default App
