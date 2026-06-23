import { Check, BarChart3 } from "lucide-react";

interface PollAnswer {
  answer_id: number;
  poll_media: {
    text?: string;
    emoji?: {
      id: string | null;
      name: string;
    };
  };
}

interface PollResult {
  answer_counts: { id: number; count: number; me_voted: boolean }[];
  is_finalized: boolean;
}

export interface Poll {
  question: { text: string };
  answers: PollAnswer[];
  expiry: string;
  allow_multiselect: boolean;
  layout_type: number;
  results?: PollResult;
}

interface Props {
  poll: Poll;
}

export function PollRenderer({ poll }: Props) {
  const totalVotes = poll.results?.answer_counts.reduce((acc, curr) => acc + curr.count, 0) || 0;
  const isFinalized = poll.results?.is_finalized || new Date(poll.expiry).getTime() < Date.now();

  const maxVotes = poll.results?.answer_counts.reduce((acc, curr) => Math.max(acc, curr.count), 0) || 0;

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "16px",
        marginTop: "8px",
        maxWidth: "520px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "15px", color: "var(--text-normal)" }}>
        <BarChart3 size={18} />
        {poll.question.text}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {poll.answers.map((answer) => {
          const result = poll.results?.answer_counts.find((r) => r.id === answer.answer_id);
          const count = result?.count || 0;
          const meVoted = result?.me_voted || false;
          const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isWinner = isFinalized && count === maxVotes && count > 0;

          return (
            <div
              key={answer.answer_id}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: meVoted ? "rgba(88,101,242,0.1)" : "var(--bg-tertiary)",
                border: `1px solid ${meVoted ? "var(--brand-500)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                minHeight: "40px",
              }}
            >
              {/* Progress bar background */}
              {totalVotes > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${percentage}%`,
                    background: isWinner ? "rgba(45, 125, 70, 0.2)" : "var(--bg-modifier-hover)",
                    zIndex: 0,
                    transition: "width 0.3s ease",
                  }}
                />
              )}

              <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "8px", color: "var(--text-normal)", fontSize: "14px", fontWeight: 500 }}>
                {answer.poll_media.emoji && (
                  answer.poll_media.emoji.id ? (
                    <img src={`https://cdn.discordapp.com/emojis/${answer.poll_media.emoji.id}.webp?size=24`} alt={answer.poll_media.emoji.name} style={{ width: 18, height: 18 }} />
                  ) : (
                    <span>{answer.poll_media.emoji.name}</span>
                  )
                )}
                {answer.poll_media.text}
              </div>

              <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
                {totalVotes > 0 && (
                  <>
                    <span style={{ color: "var(--text-muted)" }}>{count} {count === 1 ? "voto" : "votos"}</span>
                    <span style={{ color: "var(--text-normal)" }}>{percentage}%</span>
                  </>
                )}
                {isWinner && (
                  <div style={{ background: "var(--text-positive)", color: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18 }}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
        <span>{totalVotes} {totalVotes === 1 ? "voto" : "votos"}</span>
        <span>•</span>
        <span>{isFinalized ? "Votação encerrada" : "Votação em andamento"}</span>
      </div>
    </div>
  );
}
