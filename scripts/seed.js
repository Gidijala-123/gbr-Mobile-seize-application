/**
 * Seed script — inserts realistic sample data into all collections.
 * Run: node scripts/seed.js
 */

require('dotenv').config()
const { MongoClient } = require('mongodb')
const crypto = require('crypto')
const { promisify } = require('util')

const pbkdf2 = promisify(crypto.pbkdf2)
const PASSWORD_HASH_ITERATIONS = 60000

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = await pbkdf2(password, salt, PASSWORD_HASH_ITERATIONS, 64, 'sha512')
  return `pbkdf2$${PASSWORD_HASH_ITERATIONS}$${salt}$${derivedKey.toString('hex')}`
}

function sanitizeMongoUri(rawUri) {
  if (typeof rawUri !== 'string') return rawUri
  try {
    const url = new URL(rawUri)
    if (url.searchParams.has('appName')) url.searchParams.delete('appName')
    return url.toString()
  } catch {
    return rawUri
  }
}

// ── Seed data ──────────────────────────────────────────────────────────────

const STAFF_ACCOUNTS = [
  { email: 'admin@gbrcollege.edu.in',    password: 'Admin@12345' },
  { email: 'faculty1@gbrcollege.edu.in', password: 'Faculty@12345' },
  { email: 'faculty2@gbrcollege.edu.in', password: 'Faculty@12345' },
]

const STUDENT_RECORDS = [
  // ── At_office ──────────────────────────────────────────────────────────
  {
    Date: '2026-09-01', Time: '09:15',
    sname: 'Ravi Kumar Reddy',     spno: '9876543210',
    rno:   '22A81A0501',
    clg:   'GBR College of Engineering', brch: 'CSE', year: '3', sec: 'A',
    pname: 'Suresh Reddy',         ppno: '9876541230',
    ename: 'Dr. V. Nagaraju',      epno: '9848012345', eid: 'FAC001',
    rsn:   'Using phone during lecture hours',
    mmodel: 'Samsung Galaxy A54',  imei: '354823110934521', mclr: 'Black',
    status: 'At_office',
  },
  {
    Date: '2026-09-02', Time: '10:30',
    sname: 'Priya Lakshmi Devi',   spno: '9866554321',
    rno:   '22A81A0502',
    clg:   'GBR College of Engineering', brch: 'ECE', year: '2', sec: 'B',
    pname: 'Ramaiah Devi',         ppno: '9866550001',
    ename: 'Prof. K. Srinivasa',   epno: '9848067891', eid: 'FAC002',
    rsn:   'Mobile ringing in exam hall',
    mmodel: 'Redmi Note 12',       imei: '861234567890123', mclr: 'Blue',
    status: 'At_office',
  },
  {
    Date: '2026-09-03', Time: '11:00',
    sname: 'Mohammed Farhan',      spno: '9989001122',
    rno:   '22A81A0503',
    clg:   'GBR College of Engineering', brch: 'MECH', year: '4', sec: 'A',
    pname: 'Mohammed Saleem',      ppno: '9989001133',
    ename: 'Dr. P. Ramakrishna',   epno: '9848023456', eid: 'FAC003',
    rsn:   'Phone use inside lab',
    mmodel: 'iPhone 13',           imei: '359876543210987', mclr: 'Midnight',
    status: 'At_office',
  },
  {
    Date: '2026-09-04', Time: '09:45',
    sname: 'Anjali Sharma',        spno: '9700123456',
    rno:   '23A81A0101',
    clg:   'GBR College of Engineering', brch: 'CSE', year: '1', sec: 'C',
    pname: 'Rajesh Sharma',        ppno: '9700123400',
    ename: 'Prof. M. Sunitha',     epno: '9848034567', eid: 'FAC004',
    rsn:   'Browsing during theory class',
    mmodel: 'Vivo V25',            imei: '862345678901234', mclr: 'Gold',
    status: 'At_office',
  },
  {
    Date: '2026-09-05', Time: '14:00',
    sname: 'Sai Teja Varma',       spno: '9652112233',
    rno:   '22A81A0504',
    clg:   'GBR College of Engineering', brch: 'EEE', year: '3', sec: 'B',
    pname: 'Venkata Varma',        ppno: '9652112244',
    ename: 'Dr. B. Sudhakar',      epno: '9848045678', eid: 'FAC005',
    rsn:   'Cheating attempt during internals',
    mmodel: 'OnePlus Nord CE 3',   imei: '863456789012345', mclr: 'Gray',
    status: 'At_office',
  },
  {
    Date: '2026-09-08', Time: '10:15',
    sname: 'Kavya Patel',          spno: '9912334455',
    rno:   '23A81A0502',
    clg:   'GBR College of Engineering', brch: 'IT', year: '2', sec: 'A',
    pname: 'Sunil Patel',          ppno: '9912334400',
    ename: 'Prof. R. Kiranmai',    epno: '9848056789', eid: 'FAC006',
    rsn:   'Phone use during practical',
    mmodel: 'Realme 11 Pro',       imei: '864567890123456', mclr: 'Sunrise Gold',
    status: 'At_office',
  },
  {
    Date: '2026-09-10', Time: '11:30',
    sname: 'Arjun Nair',           spno: '9876001122',
    rno:   '22A81A0505',
    clg:   'GBR College of Engineering', brch: 'CIVIL', year: '4', sec: 'A',
    pname: 'Krishnan Nair',        ppno: '9876001133',
    ename: 'Dr. T. Venkateswara',  epno: '9848067890', eid: 'FAC007',
    rsn:   'Recording lecture without permission',
    mmodel: 'POCO X5 Pro',         imei: '865678901234567', mclr: 'Yellow',
    status: 'At_office',
  },

  // ── Returned ────────────────────────────────────────────────────────────
  {
    Date: '2026-08-05', Time: '09:00',
    sname: 'Deepak Mohan',         spno: '9966778899',
    rno:   '21A81A0601',
    clg:   'GBR College of Engineering', brch: 'CSE', year: '4', sec: 'A',
    pname: 'Mohan Das',            ppno: '9966778800',
    ename: 'Prof. S. Padmaja',     epno: '9848078901', eid: 'FAC008',
    rsn:   'Using phone during examination',
    mmodel: 'Samsung Galaxy M34',  imei: '866789012345678', mclr: 'Silver',
    status: 'Returned',
  },
  {
    Date: '2026-08-07', Time: '10:00',
    sname: 'Sneha Gupta',          spno: '9855667788',
    rno:   '21A81A0602',
    clg:   'GBR College of Engineering', brch: 'ECE', year: '3', sec: 'B',
    pname: 'Ramesh Gupta',         ppno: '9855667700',
    ename: 'Dr. N. Chandrasekhar', epno: '9848089012', eid: 'FAC009',
    rsn:   'Possession during exam',
    mmodel: 'Redmi 12C',           imei: '867890123456789', mclr: 'Mint Green',
    status: 'Returned',
  },
  {
    Date: '2026-08-10', Time: '11:15',
    sname: 'Kiran Babu',           spno: '9944332211',
    rno:   '21A81A0603',
    clg:   'GBR College of Engineering', brch: 'MECH', year: '4', sec: 'C',
    pname: 'Babu Rao',             ppno: '9944332200',
    ename: 'Prof. L. Satyanarayana', epno: '9848090123', eid: 'FAC010',
    rsn:   'Phone ringing in class',
    mmodel: 'Nokia G21',           imei: '868901234567890', mclr: 'Dusk',
    status: 'Returned',
  },
  {
    Date: '2026-08-12', Time: '14:30',
    sname: 'Pooja Mehta',          spno: '9933221100',
    rno:   '21A81A0604',
    clg:   'GBR College of Engineering', brch: 'IT', year: '3', sec: 'A',
    pname: 'Mahesh Mehta',         ppno: '9933221111',
    ename: 'Dr. A. Venkataramana', epno: '9848001234', eid: 'FAC011',
    rsn:   'Social media during lecture',
    mmodel: 'Moto G84',            imei: '869012345678901', mclr: 'Viva Magenta',
    status: 'Returned',
  },
  {
    Date: '2026-08-15', Time: '09:30',
    sname: 'Rohit Verma',          spno: '9911223344',
    rno:   '20A81A0701',
    clg:   'GBR College of Engineering', brch: 'EEE', year: '4', sec: 'B',
    pname: 'Sunil Verma',          ppno: '9911223300',
    ename: 'Prof. C. Bhaskara',    epno: '9848012345', eid: 'FAC012',
    rsn:   'Gaming during lab session',
    mmodel: 'Infinix Note 30',     imei: '870123456789012', mclr: 'Racing Black',
    status: 'Returned',
  },
  {
    Date: '2026-08-20', Time: '10:45',
    sname: 'Lakshmi Prasanna',     spno: '9876543201',
    rno:   '22A81A0506',
    clg:   'GBR College of Engineering', brch: 'CSE', year: '3', sec: 'D',
    pname: 'Prasanna Rao',         ppno: '9876543202',
    ename: 'Dr. V. Nagaraju',      epno: '9848012345', eid: 'FAC001',
    rsn:   'Using phone in restricted zone',
    mmodel: 'Oppo Reno 10',        imei: '871234567890123', mclr: 'Ice Blue',
    status: 'Returned',
  },
]

const VISITORS = [
  { name: 'Admin User',     email: 'admin@gbrcollege.edu.in',    time: new Date('2026-09-20T08:55:00Z') },
  { name: 'faculty1',       email: 'faculty1@gbrcollege.edu.in', time: new Date('2026-09-20T09:10:00Z') },
  { name: 'Admin User',     email: 'admin@gbrcollege.edu.in',    time: new Date('2026-09-21T08:50:00Z') },
  { name: 'faculty2',       email: 'faculty2@gbrcollege.edu.in', time: new Date('2026-09-21T10:00:00Z') },
  { name: 'faculty1',       email: 'faculty1@gbrcollege.edu.in', time: new Date('2026-09-22T09:05:00Z') },
  { name: 'Admin User',     email: 'admin@gbrcollege.edu.in',    time: new Date('2026-09-23T08:45:00Z') },
]

// ── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  const uri = sanitizeMongoUri(process.env.MONGODB_URI)
  if (!uri) { console.error('MONGODB_URI not set in .env'); process.exit(1) }

  console.log('Connecting to MongoDB Atlas...')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })
  await client.connect()
  console.log('Connected.\n')

  const dbName = new URL(uri).pathname.replace(/^\/+/, '') || 'mobile_storage_app_db'
  const db = client.db(dbName)

  // ── 1. registration_coll ────────────────────────────────────────────────
  console.log('Seeding registration_coll...')
  const regColl = db.collection('registration_coll')
  await regColl.createIndex({ email: 1 }, { unique: true })

  let regInserted = 0
  for (const account of STAFF_ACCOUNTS) {
    try {
      await regColl.insertOne({
        email: account.email,
        pwd:   await hashPassword(account.password),
        createdAt: new Date(),
      })
      console.log(`  ✓ ${account.email} (password: ${account.password})`)
      regInserted++
    } catch (err) {
      if (err.code === 11000) {
        console.log(`  ⚠  ${account.email} already exists — skipped`)
      } else {
        throw err
      }
    }
  }
  console.log(`  → ${regInserted} account(s) inserted\n`)

  // ── 2. student_data ─────────────────────────────────────────────────────
  console.log('Seeding student_data...')
  const stuColl = db.collection('student_data')
  await stuColl.createIndex({ rno: 1 })
  await stuColl.createIndex({ status: 1 })

  let stuInserted = 0
  for (const record of STUDENT_RECORDS) {
    try {
      await stuColl.insertOne(record)
      console.log(`  ✓ ${record.rno} — ${record.sname} [${record.status}]`)
      stuInserted++
    } catch (err) {
      if (err.code === 11000) {
        console.log(`  ⚠  ${record.rno} already exists — skipped`)
      } else {
        throw err
      }
    }
  }
  console.log(`  → ${stuInserted} student record(s) inserted\n`)

  // ── 3. visitors_of_page ─────────────────────────────────────────────────
  console.log('Seeding visitors_of_page...')
  const visColl = db.collection('visitors_of_page')
  const visResult = await visColl.insertMany(VISITORS)
  console.log(`  → ${visResult.insertedCount} visitor log(s) inserted\n`)

  // ── 4. error_reports — leave existing 2 docs, just print count ──────────
  const errCount = await db.collection('error_reports').countDocuments()
  console.log(`error_reports already has ${errCount} document(s) — no seed needed\n`)

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('─'.repeat(52))
  console.log('Seed complete. Login credentials:')
  console.log()
  STAFF_ACCOUNTS.forEach(a => {
    console.log(`  Email   : ${a.email}`)
    console.log(`  Password: ${a.password}`)
    console.log()
  })
  console.log('Open http://localhost:3000 and log in with any account above.')
  console.log('─'.repeat(52))

  await client.close()
}

seed().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
