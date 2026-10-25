
/* ============================================
   TBB — COVER STORY™ SHARED RENDERER
   Part 1: Timeline, polls, media, reactions,
   comments, replies, reports, owner controls
   ============================================ */

import {
  COVER_STORY_REACTIONS,
  coverStoryProfileUrl
} from "./cover-story-shared.js";

const el = (tag, className = "", text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function actionButton(label, callback) {
  const button = el("button", "btn ghost small", label);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}

function formatDate(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function createCoverStoryRenderer({
  db,
  user,
  container,
  onError = console.error,
  onChanged = async () => {}
}) {
  if (!db || !user?.id || !container) {
    throw new Error("Cover Story™ renderer is missing setup.");
  }

  const avatarCache = new Map();

  function fail(error) {
    console.error("Cover Story™:", error);
    onError(error);
  }

  async function signedUrl(bucket, path, expires = 3600) {
    if (!path) return null;

    const key = `${bucket}:${path}`;

    if (avatarCache.has(key)) {
      return avatarCache.get(key);
    }

    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(path, expires);

    if (error) return null;

    const url = data?.signedUrl || null;

    if (url && bucket === "tbb-avatars") {
      avatarCache.set(key, url);
    }

    return url;
  }

  async function profilesFor(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return {};

    const { data, error } = await db
      .from("tbb_profiles")
      .select("user_id,display_name,username,avatar_path")
      .in("user_id", unique);

    if (error) throw error;

    return Object.fromEntries(
      (data || []).map(profile => [
        profile.user_id,
        profile
      ])
    );
  }

  async function identity(memberId, profile) {
    const name = profile?.display_name || "TBB Baddie";
    const destination = coverStoryProfileUrl(memberId);

    const root = el("div", "story-member");
    const link = el("a");
    link.href = destination;
    link.setAttribute("aria-label", `View ${name}'s profile`);

    const avatar = el("span", "story-avatar");
    const initials = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase();

    avatar.textContent = initials || "💗";

    const url = await signedUrl(
      "tbb-avatars",
      profile?.avatar_path
    );

    if (url) {
      const img = el("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => {
        avatar.textContent = initials || "💗";
      };
      avatar.replaceChildren(img);
    }

    link.append(avatar);

    const details = el("div", "story-member-info");
    const nameLink = el("a", "story-member-link", name);
    nameLink.href = destination;

    details.append(nameLink);

    if (profile?.username) {
      details.append(
        el(
          "div",
          "story-handle",
          "@" + profile.username.replace(/^@/, "")
        )
      );
    }

    root.append(link, details);
    return root;
  }

  async function renderMedia(postId, card) {
    const { data, error } = await db
      .from("tbb_post_media")
      .select("storage_path,position")
      .eq("post_id", postId)
      .order("position");

    if (error) throw error;

    const gallery = el("div", "story-gallery");

    for (const media of data || []) {
      const url = await signedUrl(
        "tbb-post-media",
        media.storage_path,
        300
      );

      if (!url) continue;

      const img = el("img");
      img.src = url;
      img.alt = "Cover Story™ photo";
      img.loading = "lazy";
      gallery.append(img);
    }

    if (gallery.children.length) card.append(gallery);
  }

  async function renderPoll(post, card) {
    const area = el("div");
    card.append(area);

    async function refresh() {
      area.replaceChildren();

      const { data: options, error } = await db
        .from("tbb_post_poll_options")
        .select("id,option_text,position")
        .eq("post_id", post.id)
        .order("position");

      if (error) throw error;

      const { data: vote, error: voteError } = await db
        .from("tbb_post_poll_votes")
        .select("option_id")
        .eq("post_id", post.id)
        .eq("voter_id", user.id)
        .maybeSingle();

      if (voteError) throw voteError;

      const closed = post.poll_closes_at &&
        new Date(post.poll_closes_at) <= new Date();

      if (post.poll_closes_at) {
        area.append(
          el("p", "muted",
            "Closes: " + formatDate(post.poll_closes_at))
        );
      }

      if (vote || closed) {
        const { data: results, error: resultsError } =
          await db.rpc("tbb_poll_results", {
            p_post_id: post.id
          });

        if (resultsError) throw resultsError;

        const total = (results || []).reduce(
          (sum, option) => sum + Number(option.vote_count),
          0
        );

        for (const option of results || []) {
          const count = Number(option.vote_count);
          const percentage = total
            ? Math.round(count / total * 100)
            : 0;

          const line = el("div");
          line.style.margin = "12px 0";

          line.append(
            el("div", "", option.option_text),
            el("div", "muted",
              `${count} votes · ${percentage}%`)
          );

          const bar = el("div", "pollbar");
          const fill = el("div", "pollfill");
          fill.style.width = percentage + "%";
          bar.append(fill);
          line.append(bar);
          area.append(line);
        }

        return;
      }

      for (const option of options || []) {
        area.append(
          actionButton(option.option_text, async () => {
            try {
              const { error } = await db.rpc(
                "tbb_cast_poll_vote",
                {
                  p_post_id: post.id,
                  p_option_id: option.id
                }
              );

              if (error) throw error;
              await refresh();
            } catch (error) {
              fail(error);
            }
          })
        );
      }
    }

    await refresh();
  }

  async function renderReactions(postId, area) {
    const { data, error } = await db
      .from("tbb_post_reactions")
      .select("id,user_id,reaction_type")
      .eq("post_id", postId);

    if (error) throw error;

    area.replaceChildren();

    const reactions = data || [];
    const mine = reactions.find(
      reaction => reaction.user_id === user.id
    );

    for (const [type, emoji] of
      Object.entries(COVER_STORY_REACTIONS)) {

      const count = reactions.filter(
        reaction => reaction.reaction_type === type
      ).length;

      const selected = mine?.reaction_type === type;

      const button = actionButton(
        `${emoji} ${count}`,
        async () => {
          try {
            let result;

            if (selected) {
              result = await db
                .from("tbb_post_reactions")
                .delete()
                .eq("id", mine.id)
                .eq("user_id", user.id);
            } else if (mine) {
              result = await db
                .from("tbb_post_reactions")
                .update({ reaction_type: type })
                .eq("id", mine.id)
                .eq("user_id", user.id);
            } else {
              result = await db
                .from("tbb_post_reactions")
                .insert({
                  post_id: postId,
                  user_id: user.id,
                  reaction_type: type
                });
            }

            if (result.error) throw result.error;
            await renderReactions(postId, area);
          } catch (error) {
            fail(error);
          }
        }
      );

      if (selected) {
        button.style.borderColor = "#ff61bc";
        button.style.background = "#673052";
      }

      area.append(button);
    }
  }

  async function reportContent(type, id) {
    const allowed = [
      "harassment",
      "bullying",
      "hate_speech",
      "sexual_content",
      "spam",
      "spoilers",
      "privacy",
      "other"
    ];

    const response = prompt(
      "Report reason: " + allowed.join(", "),
      "other"
    );

    if (response === null) return;

    const reason = response.trim().toLowerCase();

    if (!allowed.includes(reason)) {
      throw new Error("Please choose a listed report reason.");
    }

    const details = prompt(
      "Optional details for the moderation team:",
      ""
    );

    if (details === null) return;

    const { error } = await db
      .from("tbb_post_reports")
      .insert({
        reporter_id: user.id,
        reason,
        details: details.trim() || null,
        post_id: type === "post" ? id : null,
        comment_id: type === "comment" ? id : null
      });

    if (error) throw error;

    alert("Your report was sent privately to the TBB team. 💗");
  }

  async function renderComments(postId, area) {
    area.replaceChildren(
      el("p", "muted", "Loading comments…")
    );

    const { data, error } = await db
      .from("tbb_post_comments")
      .select(
        "id,author_id,parent_comment_id,body,created_at"
      )
      .eq("post_id", postId)
      .eq("moderation_status", "active")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    area.replaceChildren();

    const comments = data || [];
    const profiles = await profilesFor(
      comments.map(comment => comment.author_id)
    );

    if (!comments.length) {
      area.append(
        el("p", "muted", "No comments yet. 💗")
      );
    }

    for (const comment of comments) {
      const item = el("div", "comment");
      const header = el("div", "row between");

      header.append(
        await identity(
          comment.author_id,
          profiles[comment.author_id]
        ),
        el("span", "muted", formatDate(comment.created_at))
      );

      if (comment.author_id === user.id) {
        header.append(
          actionButton("Remove", async () => {
            if (!confirm("Remove your comment?")) return;

            try {
              const { error } = await db.rpc(
                "tbb_remove_own_comment",
                { p_comment_id: comment.id }
              );

              if (error) throw error;
              await renderComments(postId, area);
            } catch (error) {
              fail(error);
            }
          })
        );
      } else {
        header.append(
          actionButton("⚑", async () => {
            try {
              await reportContent("comment", comment.id);
            } catch (error) {
              fail(error);
            }
          })
        );
      }

      item.append(header, el("p", "", comment.body));

      if (comment.parent_comment_id) {
        item.style.marginLeft = "22px";
        item.style.borderLeft = "2px solid #ff61bc";
        item.style.paddingLeft = "12px";
      }

      item.append(
        actionButton("↩️ Reply", () => {
          const existing = item.querySelector(".inline-reply");

          if (existing) {
            existing.remove();
            return;
          }

          const form = el("form", "inline-reply");
          const textarea = el("textarea");
          textarea.maxLength = 2000;
          textarea.required = true;
          textarea.placeholder = "Write your reply… 💗";

          const submit = el("button", "btn small", "Send Reply");
          submit.type = "submit";

          form.append(textarea, submit);

          form.addEventListener("submit", async event => {
            event.preventDefault();

            submit.disabled = true;

            try {
              const { error } = await db
                .from("tbb_post_comments")
                .insert({
                  post_id: postId,
                  parent_comment_id: comment.id,
                  author_id: user.id,
                  body: textarea.value.trim()
                });

              if (error) throw error;
              await renderComments(postId, area);
            } catch (error) {
              fail(error);
            } finally {
              submit.disabled = false;
            }
          });

          item.append(form);
          textarea.focus();
        })
      );

      area.append(item);
    }

    const form = el("form");
    const textarea = el("textarea");
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.placeholder = "Leave a comment, Baddie… 💗";

    const submit = el("button", "btn small", "Post Comment");
    submit.type = "submit";

    form.append(textarea, submit);

    form.addEventListener("submit", async event => {
      event.preventDefault();
      submit.disabled = true;

      try {
        const { error } = await db
          .from("tbb_post_comments")
          .insert({
            post_id: postId,
            author_id: user.id,
            body: textarea.value.trim()
          });

        if (error) throw error;
        await renderComments(postId, area);
      } catch (error) {
        fail(error);
      } finally {
        submit.disabled = false;
      }
    });

    area.append(form);
  }

  async function renderPost(post, profiles) {
    const card = el("article", "post panel");
    const header = el("div", "posthead");

    const author = el("div");

    author.append(
      await identity(post.author_id, profiles[post.author_id]),
      el("div", "muted", formatDate(post.created_at)),
      el(
        "div",
        "posttype",
        post.post_type === "poll"
          ? "📊 BADDIE POLL"
          : post.post_type === "image"
            ? "📸 PHOTO STORY"
            : "💌 COVER STORY"
      )
    );

    header.append(
      author,
      el(
        "span",
        "muted",
        post.visibility === "besties_only"
          ? "🔒 Besties Only"
          : "🌎 All Baddies"
      )
    );

    card.append(header);

    if (post.body) {
      card.append(el("div", "postbody", post.body));
    }

    if (post.post_type === "image") {
      await renderMedia(post.id, card);
    }

    if (post.post_type === "poll") {
      await renderPoll(post, card);
    }

    const actions = el("div", "postactions");
    const reactions = el("div", "row");
    actions.append(reactions);

    await renderReactions(post.id, reactions);

    const comments = el("div", "comments");
    comments.hidden = true;

    actions.append(
      actionButton("💬 Comments", async () => {
        comments.hidden = !comments.hidden;

        if (!comments.hidden) {
          try {
            await renderComments(post.id, comments);
          } catch (error) {
            fail(error);
          }
        }
      })
    );

    if (post.author_id === user.id) {
      if (post.post_type === "text") {
        actions.append(
          actionButton("✏️ Edit", async () => {
            const updated = prompt(
              "Edit your Cover Story:",
              post.body
            );

            if (updated === null) return;

            const body = updated.trim();

            if (!body || body.length > 5000) {
              return fail(new Error(
                "Your story must contain 1–5000 characters."
              ));
            }

            try {
              const { data, error } = await db
                .from("tbb_posts")
                .update({ body })
                .eq("id", post.id)
                .eq("author_id", user.id)
                .eq("post_type", "text")
                .select("id");

              if (error) throw error;

              if (!data?.length) {
                throw new Error("Story could not be edited.");
              }

              await onChanged();
            } catch (error) {
              fail(error);
            }
          })
        );
      }

      actions.append(
        actionButton("🗑️ Remove", async () => {
          if (!confirm("Remove this Cover Story?")) return;

          try {
            const { data, error } = await db.rpc(
              "tbb_remove_own_post",
              { p_post_id: post.id }
            );

            if (error) throw error;
            if (!data) throw new Error(
              "This story could not be removed."
            );

            await onChanged();
          } catch (error) {
            fail(error);
          }
        })
      );
    } else {
      actions.append(
        actionButton("⚑ Report", async () => {
          try {
            await reportContent("post", post.id);
          } catch (error) {
            fail(error);
          }
        })
      );
    }

    card.append(actions, comments);

    return card;
  }

  async function render(posts) {
    container.replaceChildren();

    if (!posts?.length) {
      container.append(
        el(
          "div",
          "empty panel",
          "No Cover Story™ posts to show yet. 💗"
        )
      );
      return;
    }

    try {
      const profiles = await profilesFor(
        posts.map(post => post.author_id)
      );

      for (const post of posts) {
        container.append(await renderPost(post, profiles));
      }
    } catch (error) {
      fail(error);
    }
  }

  return { render };
}
