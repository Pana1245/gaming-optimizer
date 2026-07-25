import Modal from "./Modal";
import { useUpdater } from "../lib/updater";
import { useI18n } from "../lib/i18n";

export default function UpdateBanner() {
  const { upd, installing, install, dismiss } = useUpdater();
  const { t } = useI18n();

  return (
    <Modal
      open={!!upd}
      title={`${t("update.available")}${upd?.version ? ` · v${upd.version}` : ""}`}
      onClose={dismiss}
      onConfirm={install}
      confirmText={installing ? t("update.installing") : t("update.now")}
      closeText={t("update.later")}
    >
      {upd?.body?.trim() || t("update.body")}
    </Modal>
  );
}
