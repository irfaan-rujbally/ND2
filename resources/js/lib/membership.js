/**
 * Option lists for the membership application. The non-constituency lists are
 * transcribed from the public form at https://nouveauxdemocrates.com/join so the
 * admin form collects exactly the same information, with the same wording.
 *
 * CONSTITUENCIES is the official list of Mauritius's 21 electoral
 * constituencies, corrected 2026-08-20 from the list supplied by the client —
 * the public form's wording was wrong (No. 15 was labelled "Flic en Flac & La
 * Gris Gris", which is not a constituency; it is La Caverne and Phoenix). Only
 * labels changed; the stored numbers are unchanged, so existing member records
 * keep their meaning.
 */

export const CONSTITUENCIES = [
  { value: 1, label: 'No. 1 - Grand River North West and Port Louis West' },
  { value: 2, label: 'No. 2 - Port Louis South and Port Louis Central' },
  { value: 3, label: 'No. 3 - Port Louis Maritime and Port Louis East' },
  { value: 4, label: 'No. 4 - Port Louis North and Montagne Longue' },
  { value: 5, label: 'No. 5 - Pamplemousses and Triolet' },
  { value: 6, label: "No. 6 - Grand Baie and Poudre d'Or" },
  { value: 7, label: 'No. 7 - Piton and Rivière du Rempart' },
  { value: 8, label: 'No. 8 - Quartier Militaire and Moka' },
  { value: 9, label: 'No. 9 - Flacq and Bon Accueil' },
  { value: 10, label: 'No. 10 - Montagne Blanche and Grand River South East' },
  { value: 11, label: 'No. 11 - Vieux Grand Port and Rose Belle' },
  { value: 12, label: 'No. 12 - Mahébourg and Plaine Magnien' },
  { value: 13, label: 'No. 13 - Rivière des Anguilles and Souillac' },
  { value: 14, label: 'No. 14 - Savanne and Black River' },
  { value: 15, label: 'No. 15 - La Caverne and Phoenix' },
  { value: 16, label: 'No. 16 - Vacoas and Floreal' },
  { value: 17, label: 'No. 17 - Curepipe and Midlands' },
  { value: 18, label: 'No. 18 - Belle Rose and Quatre Bornes' },
  { value: 19, label: 'No. 19 - Stanley and Rose Hill' },
  { value: 20, label: 'No. 20 - Beau Bassin and Petite Rivière' },
  { value: 21, label: 'No. 21 - Rodrigues' },
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
