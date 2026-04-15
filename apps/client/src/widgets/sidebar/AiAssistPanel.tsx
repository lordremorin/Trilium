import "./AiAssistPanel.css";

import { useCallback, useRef, useState } from "preact/hooks";

import { t } from "../../services/i18n.js";
import server from "../../services/server.js";
import toastService from "../../services/toast.js";
import ActionButton from "../react/ActionButton.js";
import { useActiveNoteContext } from "../react/hooks.js";
import RightPanelWidget from "./RightPanelWidget.js";

export default function AiAssistPanel() {
    const { noteId, note } = useActiveNoteContext();
    const [prompt, setPrompt] = useState("");
    const [response, setResponse] = useState("");
    const [loading, setLoading] = useState(false);
    const promptRef = useRef<HTMLTextAreaElement>(null);

    const submitPrompt = useCallback(async () => {
        const trimmed = prompt.trim();
        if (!trimmed || !noteId) return;

        setLoading(true);
        setResponse("");

        try {
            const result = await server.post<{ content: string }>("ai-assist/generate", {
                noteId,
                prompt: trimmed,
            });
            setResponse(result.content);
        } catch (e: any) {
            const message = e?.message || t("ai_assist_panel.error_generic");
            setResponse(message);
            toastService.showError(message);
        } finally {
            setLoading(false);
        }
    }, [prompt, noteId]);

    const applyToNote = useCallback(async () => {
        if (!response || !noteId) return;

        try {
            await server.post("ai-assist/apply", {
                noteId,
                content: response,
            });
            toastService.showMessage(t("ai_assist_panel.applied_success"));
        } catch (e: any) {
            const message = e?.message || t("ai_assist_panel.error_generic");
            toastService.showError(message);
        }
    }, [response, noteId]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitPrompt();
        }
    }, [submitPrompt]);

    if (!note || (note.type !== "text" && note.type !== "code")) {
        return null;
    }

    return (
        <RightPanelWidget id="ai-assist" title={t("ai_assist_panel.title")}>
            <div class="ai-assist-panel">
                <textarea
                    ref={promptRef}
                    class="ai-assist-prompt"
                    rows={3}
                    placeholder={t("ai_assist_panel.prompt_placeholder")}
                    value={prompt}
                    onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                />

                <div class="ai-assist-actions">
                    <ActionButton
                        icon="bx bx-send"
                        text={t("ai_assist_panel.submit")}
                        onClick={submitPrompt}
                        disabled={loading || !prompt.trim()}
                    />
                    {response && (
                        <ActionButton
                            icon="bx bx-check"
                            text={t("ai_assist_panel.apply_to_note")}
                            onClick={applyToNote}
                        />
                    )}
                </div>

                {loading && (
                    <div class="ai-assist-spinner">
                        <span class="bx bx-loader-alt bx-spin" />
                        <span>{t("ai_assist_panel.generating")}</span>
                    </div>
                )}

                {response && (
                    <div class="ai-assist-response">
                        {response}
                    </div>
                )}
            </div>
        </RightPanelWidget>
    );
}
