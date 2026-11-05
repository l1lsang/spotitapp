import { useEffect, type PropsWithChildren } from "react";
import { ActivityIndicator } from "react-native";
import { Redirect, router, usePathname } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { Button, Notice, p, Screen } from "./ui";
export function AuthGate({ children }: PropsWithChildren) {
  const { currentUser, profile, profileError, loading, refreshProfile } =
    useAuth();
  const path = usePathname();
  useEffect(() => {
    if (!loading && currentUser && profile?.onboardingComplete === false)
      router.replace("/signup");
  }, [loading, currentUser, profile?.onboardingComplete]);
  if (loading)
    return (
      <Screen>
        <ActivityIndicator color={p.primary} />
      </Screen>
    );
  if (!currentUser)
    return (
      <Redirect href={{ pathname: '/login', params: { from: path } }} />
    );
  if (profileError)
    return (
      <Screen title="프로필 확인">
        <Notice error>{profileError}</Notice>
        <Button
          title="다시 시도"
          onPress={() => void refreshProfile().catch(() => undefined)}
        />
      </Screen>
    );
  if (profile?.onboardingComplete === false) return null;
  return children;
}
