import { Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Heart, MapPin, MessageCircle } from "lucide-react-native";
import { p, s, Avatar } from "./ui";
import type { Post } from "../types/post";
export function PostCard({ post }: { post: Post }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${post.title}, ${post.placeName}`}
      onPress={() => router.push(`/posts/${post.id}`)}
      style={[s.card, { padding: 0, overflow: "hidden" }]}
    >
      {!!post.photoUrls[0] && (
        <Image
          source={{ uri: post.photoThumbnailUrls?.[0] || post.photoUrls[0] }}
          style={{
            width: "100%",
            aspectRatio: 1.35,
            backgroundColor: p.surface,
          }}
        />
      )}
      <View style={{ padding: 17, gap: 10 }}>
        <View style={s.row}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: post.pinColor || p.coral,
            }}
          />
          <Text style={s.muted}>
            {post.dateKey.replaceAll("-", ".")} ·{" "}
            {post.visibility === "private"
              ? "나만 보기"
              : post.visibility === "group"
                ? "그룹 공개"
                : post.visibility === "public"
                  ? "전체 공개"
                  : "팔로워 공개"}
          </Text>
        </View>
        <Text style={{ fontSize: 19, fontWeight: "700", color: p.ink }}>
          {post.title}
        </Text>
        {!!post.content && (
          <Text numberOfLines={2} style={s.text}>
            {post.content}
          </Text>
        )}
        <View style={s.row}>
          <MapPin size={14} color={p.primary} />
          <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>
            {post.placeName}
          </Text>
        </View>
        <View style={s.between}>
          <Pressable
            style={s.row}
            onPress={() => router.push(`/people/${post.uid}`)}
          >
            <Avatar name={post.authorNickname} size={26} />
            <Text style={s.muted}>{post.authorNickname}</Text>
          </Pressable>
          <View style={s.row}>
            <Heart size={16} color={p.coral} />
            <Text style={s.muted}>{post.likeCount || 0}</Text>
            <MessageCircle size={16} color={p.muted} />
            <Text style={s.muted}>{post.commentCount || 0}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
