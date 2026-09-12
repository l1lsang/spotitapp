import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { requireDb } from '../lib/firebase'
import { SIGNUP_POLICY_VERSION } from '../lib/signupRequirements'

export async function hasLocationConsent(uid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(requireDb(), 'users', uid, 'private', 'locationConsent'))
  return snapshot.data()?.accepted === true && snapshot.data()?.version === SIGNUP_POLICY_VERSION
}

export async function saveLocationConsent(uid: string, accepted: boolean): Promise<void> {
  await setDoc(doc(requireDb(), 'users', uid, 'private', 'locationConsent'), {
    accepted, version: SIGNUP_POLICY_VERSION, updatedAt: serverTimestamp(),
  })
}
