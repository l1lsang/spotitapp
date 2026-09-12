import { useContext } from 'react'
import { AuthContext } from '../contexts/authContextCore'

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('AuthProvider 안에서 useAuth를 사용해 주세요.')
  }

  return context
}
