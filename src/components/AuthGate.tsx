import { useEffect, type PropsWithChildren } from "react";
import { ActivityIndicator } from "react-native";
import { router, usePathname } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { Button, Empty, Notice, p, Screen } from "./ui";
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
      <Screen title="스팟잇">
        <Empty
          title="로그인하고 함께 기록해요"
          description="계정을 연결하면 웹에서 남긴 기록도 이어서 볼 수 있어요."
        />
        <Button
          title="로그인"
          onPress={() =>
            router.push({ pathname: "/login", params: { from: path } })
          }
        />
        <Button
          title="회원가입"
          variant="secondary"
          onPress={() => router.push("/signup")}
        />
      </Screen>
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
