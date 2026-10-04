// Production dialog and operation hook, synthetic intercepted API only.
import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import FeedAddModal from "../../src/components/FeedAddModal";
import { useFeedOperations } from "../../src/hooks/useFeedOperations";

function Fixture() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [cookie, setCookie] = useState("");
  const [cssSelector, setCssSelector] = useState("");
  const [cookieOpen, setCookieOpen] = useState(false);
  const [cssSelectorOpen, setCssSelectorOpen] = useState(false);
  const [useRsshub, setUseRsshub] = useState(true);
  const [added, setAdded] = useState(0);
  const operations = useFeedOperations({
    onFeedAdded: () => setAdded((value) => value + 1),
    onFeedDeleted: () => {},
    onFeedRenamed: () => {},
    onFeedsImported: () => {},
  });
  function close() {
    setOpen(false);
    setUrl("");
    setCookie("");
    setCssSelector("");
    setUseRsshub(true);
    operations.clearError();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await operations.addFeed(
      url,
      close,
      cookie || undefined,
      cssSelector || undefined,
      useRsshub,
    );
    if (result?.canRetryWithSelector) setCssSelectorOpen(true);
  }
  return (
    <>
      <button onClick={() => setOpen(true)}>フィードを追加する</button>
      <button onClick={close}>外部から破棄</button>
      <button onClick={() => setUrl("https://replacement.test/feed.xml")}>外部から入力変更</button>
      <button onClick={() => setUrl("https://example.test/feed.xml")}>外部から元入力に戻す</button>
      <output aria-label="追加数">{added}</output>
      {open && (
        <FeedAddModal
          url={url}
          onUrlChange={setUrl}
          cookie={cookie}
          onCookieChange={setCookie}
          cssSelector={cssSelector}
          onCssSelectorChange={setCssSelector}
          cookieOpen={cookieOpen}
          onCookieOpenChange={setCookieOpen}
          cssSelectorOpen={cssSelectorOpen}
          onCssSelectorOpenChange={setCssSelectorOpen}
          useRsshub={useRsshub}
          onUseRsshubChange={setUseRsshub}
          adding={operations.adding}
          error={operations.error || null}
          onSubmit={submit}
          onClose={close}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
