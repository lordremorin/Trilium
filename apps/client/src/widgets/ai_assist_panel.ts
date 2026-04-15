import { t } from "../services/i18n.js";
import RightPanelWidget from "./right_panel_widget.js";
import OnClickButtonWidget from "./buttons/onclick_button.js";
import appContext, { type EventData } from "../components/app_context.js";
import server from "../services/server.js";
import toastService from "../services/toast.js";
import type FNote from "../entities/fnote.js";

const TPL = /*html*/`<div class="ai-assist-widget">
    <style>
        .ai-assist-widget {
            padding: 10px;
            contain: none;
            overflow: auto;
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .ai-assist-widget .ai-assist-response {
            min-height: 40px;
            max-height: 300px;
            overflow-y: auto;
            padding: 8px;
            border: 1px solid var(--main-border-color);
            border-radius: 4px;
            font-size: 0.9em;
            white-space: pre-wrap;
            display: none;
        }

        .ai-assist-widget .ai-assist-response.visible {
            display: block;
        }

        .ai-assist-widget .ai-assist-input-group {
            display: flex;
            gap: 4px;
        }

        .ai-assist-widget .ai-assist-prompt {
            flex: 1;
            resize: vertical;
            min-height: 60px;
            max-height: 200px;
            padding: 6px 8px;
            border: 1px solid var(--main-border-color);
            border-radius: 4px;
            font-size: 0.9em;
            font-family: inherit;
            background: var(--accented-background-color);
            color: var(--main-text-color);
        }

        .ai-assist-widget .ai-assist-prompt::placeholder {
            color: var(--muted-text-color);
        }

        .ai-assist-widget .ai-assist-actions {
            display: flex;
            gap: 4px;
        }

        .ai-assist-widget .ai-assist-btn {
            padding: 4px 12px;
            border: 1px solid var(--main-border-color);
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            background: var(--accented-background-color);
            color: var(--main-text-color);
        }

        .ai-assist-widget .ai-assist-btn:hover {
            background: var(--hover-item-background-color);
        }

        .ai-assist-widget .ai-assist-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .ai-assist-widget .ai-assist-btn-primary {
            background: var(--main-background-color);
            font-weight: 600;
        }

        .ai-assist-widget .ai-assist-spinner {
            display: none;
            align-items: center;
            gap: 6px;
            font-size: 0.85em;
            color: var(--muted-text-color);
        }

        .ai-assist-widget .ai-assist-spinner.visible {
            display: flex;
        }
    </style>

    <textarea class="ai-assist-prompt" rows="3"></textarea>

    <div class="ai-assist-actions">
        <button class="ai-assist-btn ai-assist-btn-primary ai-assist-submit">
            <span class="bx bx-send"></span>
        </button>
        <button class="ai-assist-btn ai-assist-apply" style="display: none;">
            <span class="bx bx-check"></span>
        </button>
    </div>

    <div class="ai-assist-spinner">
        <span class="bx bx-loader-alt bx-spin"></span>
        <span class="ai-assist-spinner-text"></span>
    </div>

    <div class="ai-assist-response"></div>
</div>`;

export default class AiAssistPanelWidget extends RightPanelWidget {
    private $prompt!: JQuery<HTMLElement>;
    private $submitBtn!: JQuery<HTMLElement>;
    private $applyBtn!: JQuery<HTMLElement>;
    private $response!: JQuery<HTMLElement>;
    private $spinner!: JQuery<HTMLElement>;
    private $spinnerText!: JQuery<HTMLElement>;
    private lastResponse: string = "";

    get widgetTitle() {
        return t("ai_assist_panel.title");
    }

    get widgetButtons() {
        return [
            new OnClickButtonWidget()
                .icon("bx-x")
                .titlePlacement("left")
                .onClick((widget) => widget.triggerCommand("closeAiAssist"))
                .class("icon-action")
        ];
    }

    isEnabled() {
        return (
            super.isEnabled()
            && this.note != null
            && (this.note.type === "text" || this.note.type === "code")
            && !this.noteContext?.viewScope?.aiAssistTemporarilyHidden
            && this.noteContext?.viewScope?.viewMode === "default"
        );
    }

    async doRenderBody() {
        this.$body.empty().append($(TPL));
        this.$prompt = this.$body.find(".ai-assist-prompt");
        this.$submitBtn = this.$body.find(".ai-assist-submit");
        this.$applyBtn = this.$body.find(".ai-assist-apply");
        this.$response = this.$body.find(".ai-assist-response");
        this.$spinner = this.$body.find(".ai-assist-spinner");
        this.$spinnerText = this.$body.find(".ai-assist-spinner-text");

        this.$prompt.attr("placeholder", t("ai_assist_panel.prompt_placeholder"));
        this.$submitBtn.attr("title", t("ai_assist_panel.submit"));
        this.$applyBtn.attr("title", t("ai_assist_panel.apply_to_note"));

        this.$submitBtn.on("click", () => this.submitPrompt());
        this.$applyBtn.on("click", () => this.applyToNote());

        this.$prompt.on("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.submitPrompt();
            }
        });
    }

    async refreshWithNote(note: FNote) {
        // Reset UI state when switching notes
        this.lastResponse = "";
        this.$response.text("").removeClass("visible");
        this.$applyBtn.hide();
    }

    private async submitPrompt() {
        const prompt = (this.$prompt.val() as string || "").trim();
        if (!prompt || !this.noteId) {
            return;
        }

        this.setLoading(true);
        this.$response.text("").removeClass("visible");
        this.$applyBtn.hide();

        try {
            const result = await server.post<{ content: string }>(`ai-assist/generate`, {
                noteId: this.noteId,
                prompt
            });

            this.lastResponse = result.content;
            this.$response.text(result.content).addClass("visible");
            this.$applyBtn.show();
        } catch (e: any) {
            const message = e?.message || t("ai_assist_panel.error_generic");
            this.$response.text(message).addClass("visible");
            toastService.showError(message);
        } finally {
            this.setLoading(false);
        }
    }

    private async applyToNote() {
        if (!this.lastResponse || !this.noteId) {
            return;
        }

        try {
            await server.post(`ai-assist/apply`, {
                noteId: this.noteId,
                content: this.lastResponse
            });
            toastService.showMessage(t("ai_assist_panel.applied_success"));
        } catch (e: any) {
            const message = e?.message || t("ai_assist_panel.error_generic");
            toastService.showError(message);
        }
    }

    private setLoading(loading: boolean) {
        this.$submitBtn.prop("disabled", loading);
        this.$prompt.prop("disabled", loading);
        if (loading) {
            this.$spinner.addClass("visible");
            this.$spinnerText.text(t("ai_assist_panel.generating"));
        } else {
            this.$spinner.removeClass("visible");
        }
    }

    async closeAiAssistCommand() {
        if (this.noteContext?.viewScope) {
            this.noteContext.viewScope.aiAssistTemporarilyHidden = true;
        }
        await this.refresh();
        this.triggerCommand("reEvaluateRightPaneVisibility");
    }

    async showAiAssistWidgetEvent({ noteId }: EventData<"showAiAssistWidget">) {
        if (this.noteId === noteId) {
            if (this.noteContext?.viewScope) {
                this.noteContext.viewScope.aiAssistTemporarilyHidden = false;
            }
            await this.refresh();
            this.triggerCommand("reEvaluateRightPaneVisibility");
        }
    }

    async entitiesReloadedEvent({ loadResults }: EventData<"entitiesReloaded">) {
        if (this.noteId && loadResults.isNoteContentReloaded(this.noteId)) {
            await this.refresh();
        }
    }
}
