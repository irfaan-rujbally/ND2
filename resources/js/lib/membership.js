/**
 * Option lists for the membership application, transcribed from the public form
 * at https://nouveauxdemocrates.com/join so the admin form collects exactly the
 * same information, with the same wording.
 *
 * Constituencies are stored as their number. Rodrigues is Mauritius's 21st
 * constituency, which is why the existing numeric `constituency` column covers
 * every option the public form offers.
 */

export const CONSTITUENCIES = [
  { value: 1, label: 'No. 1 - Grand River North West & Port Louis West' },
  { value: 2, label: 'No. 2 - Port Louis South & Port Louis Central' },
  { value: 3, label: 'No. 3 - Port Louis Maritime & Port Louis East' },
  { value: 4, label: 'No. 4 - Port Louis North & Montagne Longue' },
  { value: 5, label: 'No. 5 - Pamplemousses & Triolet' },
  { value: 6, label: "No. 6 - Grand Baie & Poudre d'Or" },
  { value: 7, label: 'No. 7 - Piton & Rivière du Rempart' },
  { value: 8, label: 'No. 8 - Quartier Militaire & Moka' },
  { value: 9, label: 'No. 9 - Flacq & Bon Accueil' },
  { value: 10, label: 'No. 10 - Montagne Blanche & GRSE' },
  { value: 11, label: 'No. 11 - Vieux Grand Port & Rose Belle' },
  { value: 12, label: 'No. 12 - Mahebourg & Plaine Magnien' },
  { value: 13, label: 'No. 13 - Rivière des Anguilles & Souillac' },
  { value: 14, label: 'No. 14 - Savanne & Black River' },
  { value: 15, label: 'No. 15 - Flic en Flac & La Gris Gris' },
  { value: 16, label: 'No. 16 - Vacoas & Floréal' },
  { value: 17, label: 'No. 17 - Curepipe & Midlands' },
  { value: 18, label: 'No. 18 - Belle Rose & Quatre Bornes' },
  { value: 19, label: 'No. 19 - Stanley & Rose Hill' },
  { value: 20, label: 'No. 20 - Beau Bassin & Petite Rivière' },
  { value: 21, label: 'Rodrigues' },
]

export function constituencyLabel(value) {
  if (value === null || value === undefined || value === '') return null
  return CONSTITUENCIES.find((c) => c.value === Number(value))?.label ?? String(value)
}

export const GENDERS = ['Male', 'Female']

export const COMMUNICATION_METHODS = ['Email', 'SMS', 'WhatsApp']

export const VOLUNTEER_INTERESTS = [
  'Community Outreach',
  'Event Organisation',
  'Public Speaking',
  'Administrative Support',
  'Fundraising',
  'Digital Campaigns (Social Media/Website Management)',
]

export const HEARD_ABOUT_US = ['Social Media', 'Word of Mouth', 'Website', 'News Media']

/** Kept from the pre-existing data: 89 members already carry an age range. */
export const AGE_RANGES = ['16-18', '18-30', '31-40', '41-50', '51-60', '60+']

export const DOCUMENT_ACCEPT = {
  cv: '.pdf,.doc,.docx,.jpg,.jpeg,.png',
  documents: '.pdf,.jpg,.jpeg,.png',
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
