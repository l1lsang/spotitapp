import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "./useAuth";
import {
  getProfilePosts,
  getUserPosts,
  getVisiblePostPage,
  subscribeToLikedPosts,
  type PostPageCursor,
} from "../services/postService";
import { invalidateAppReads } from "../lib/readCache";
import type { Post } from "../types/post";
export function usePosts(
  kind: "visible" | "mine" | "liked" = "visible",
  ownerUid?: string,
  pageSize = 80,
) {
  const { currentUser, firebaseReady } = useAuth();
  const uid = currentUser?.uid;
  const revision = useRef(0);
  const moreLock = useRef(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<PostPageCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const refresh = useCallback(async () => {
    const run = ++revision.current;
    setError("");
    setCursor(null);
    if (!firebaseReady) {
      setPosts([]);
      setLoading(false);
      return;
    }
    if (kind === "liked") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      invalidateAppReads();
      let result: Post[];
      let next: PostPageCursor | null = null;
      if (ownerUid) result = (await getProfilePosts(ownerUid, uid)).posts;
      else if (kind === "mine") result = uid ? await getUserPosts(uid) : [];
      else if (uid) {
        const page = await getVisiblePostPage(uid, null, pageSize);
        result = page.posts;
        next = page.nextCursor;
      } else result = [];
      if (run === revision.current) {
        setPosts(result);
        setCursor(next);
      }
    } catch (e) {
      if (run === revision.current) {
        setPosts([]);
        setError(
          e instanceof Error ? e.message : "기록을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (run === revision.current) setLoading(false);
    }
  }, [kind, ownerUid, uid, firebaseReady, pageSize]);
  const loadMore = useCallback(async () => {
    if (!uid || !cursor || moreLock.current || loading) return;
    const run = revision.current;
    moreLock.current = true;
    setLoadingMore(true);
    try {
      const page = await getVisiblePostPage(uid, cursor, pageSize);
      if (run === revision.current) {
        setPosts((old) => [
          ...old,
          ...page.posts.filter(
            (post) => !old.some((item) => item.id === post.id),
          ),
        ]);
        setCursor(page.nextCursor);
      }
    } catch (e) {
      if (run === revision.current)
        setError(
          e instanceof Error ? e.message : "다음 기록을 불러오지 못했습니다.",
        );
    } finally {
      moreLock.current = false;
      setLoadingMore(false);
    }
  }, [uid, cursor, loading, pageSize]);
  useFocusEffect(
    useCallback(() => {
      // Likes use a live subscription. Returning to this screen must not clear
      // its snapshot when Firestore has no new event to deliver.
      if (kind !== "liked") setPosts([]);
      void refresh();
      return () => {
        revision.current++;
      };
    }, [refresh, kind]),
  );
  useEffect(() => {
    if (kind !== "liked") return;
    setPosts([]);
    setError("");
    if (!uid || !firebaseReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeToLikedPosts(
      uid,
      (list) => {
        setPosts(list);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [kind, uid, firebaseReady]);
  return {
    posts,
    loading,
    error,
    refresh,
    loadMore,
    loadingMore,
    hasMore: Boolean(cursor),
  };
}
