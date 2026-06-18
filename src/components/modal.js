import { escapeHtml } from "../utils/format.js";

/**
 * A generic modal system for forms and confirmations.
 */
export function openModal(options) {
    const { title, content, onSubmit, onCancel, submitLabel = "Save", cancelLabel = "Cancel", isForm = true } = options;

    const existing = document.getElementById("app-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "app-modal";
    modal.className =
        "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in";

    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-slide-up border border-slate-200">
            <div class="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 flex-shrink-0">
                <h3 class="text-xl font-black text-slate-900 truncate">${escapeHtml(title)}</h3>
                <button id="modal-close" class="text-slate-400 hover:text-pink-500 hover:bg-pink-50 transition-all rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><i class="fas fa-times"></i></button>
            </div>
            <div class="px-8 py-6 overflow-y-auto flex-1 min-h-0">
                ${isForm ? `<form id="modal-form" class="grid gap-4">${content}</form>` : content}
            </div>
            <div class="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
                <button id="modal-cancel" type="button" class="px-5 py-2.5 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 font-bold transition-all shadow-sm">${escapeHtml(cancelLabel)}</button>
                ${onSubmit ? `<button id="modal-submit" type="submit" form="${isForm ? "modal-form" : ""}" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-pink-500 text-white font-bold shadow-lg shadow-pink-500/20 hover:scale-[1.02] transition-all">${escapeHtml(submitLabel)}</button>` : ""}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
        modal.classList.remove("animate-fade-in");
        modal.classList.add("opacity-0", "transition-opacity", "duration-200");
        setTimeout(() => modal.remove(), 200);
    };

    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", (e) => {
        if (onCancel) onCancel(e);
        close();
    });

    if (onSubmit && isForm) {
        document.getElementById("modal-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById("modal-submit");
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                await onSubmit(e, document.getElementById("modal-form"), close);
            } catch (error) {
                console.error(error);
            } finally {
                if (document.getElementById("modal-submit")) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
        });
    } else if (onSubmit && !isForm) {
        document.getElementById("modal-submit").addEventListener("click", async (e) => {
            const submitBtn = document.getElementById("modal-submit");
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                await onSubmit(e, null, close);
            } catch (error) {
                console.error(error);
            } finally {
                if (document.getElementById("modal-submit")) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
        });
    }
}
