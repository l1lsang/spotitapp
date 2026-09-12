import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { useAuth } from "../hooks/useAuth";
export function NotificationListener() {
  const { currentUser } = useAuth();
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      Constants.appOwnership === "expo" ||
      !currentUser
    )
      return;
    let active = true;
    let remove: (() => void) | undefined;
    void import("expo-notifications").then((Notifications) => {
      if (!active) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      const handle = (
        response: import("expo-notifications").NotificationResponse,
      ) => {
        const href = response.notification.request.content.data?.href;
        if (
          typeof href === "string" &&
          /^\/(chats|posts|people|groups|notifications|profile)(\/|\?|$)/.test(
            href,
          )
        ) {
          router.push(href as Href);
        }
      };
      const sub = Notifications.addNotificationResponseReceivedListener(handle);
      remove = () => sub.remove();
      void Notifications.getLastNotificationResponseAsync().then((last) => {
        if (last && active) {
          handle(last);
          void Notifications.clearLastNotificationResponseAsync();
        }
      });
    });
    return () => {
      active = false;
      remove?.();
    };
  }, [currentUser]);
  return null;
}
