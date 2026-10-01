"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectTtsVoice } from "../lib/tts-voice";
import { useSyncedRef } from "./useSyncedRef";

/** Opt-in, device-local narration. Never select a remote/default unclassified voice. */
export function useImmersiveNarration(
  key: string | undefined,
  text: string,
  paused: boolean,
  pageVisible: boolean,
  speed: number,
) {
  const [enabled, setEnabled] = useState(false);
  const [finishedKey, setFinishedKey] = useState<string>();
  const [message, setMessage] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const enabledRef = useSyncedRef(enabled);
  const stateRef = useSyncedRef({ key, text, paused, pageVisible, speed });
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const cancel = useCallback(() => {
    const owned = utteranceRef.current;
    utteranceRef.current = null;
    clearInterval(startTimer.current);
    if (owned && supported) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
  }, [supported]);
  useEffect(() => {
    if (!supported) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, [supported]);
  const start = useCallback(() => {
    const state = stateRef.current;
    if (!supported || !state.key || !state.text) return;
    const local = window.speechSynthesis.getVoices().filter((voice) => voice.localService === true);
    const voice = selectTtsVoice(local, null, "ja-JP");
    if (!voice) {
      setEnabled(false);
      enabledRef.current = false;
      setMessage(
        "端末内の音声が利用できません。音声の準備後にもう一度お試しください。記事の自動送りは続きます",
      );
      return;
    }
    cancel();
    const chars = Array.from(state.text);
    const parts = Array.from({ length: Math.ceil(chars.length / 100) }, (_, i) =>
      chars.slice(i * 100, (i + 1) * 100).join(""),
    );
    setFinishedKey(undefined);
    setMessage(
      voice.lang.toLowerCase().startsWith("ja")
        ? "端末内の日本語音声で読み上げます"
        : "日本語音声がないため、端末内の別言語の音声を使います",
    );
    const speakPart = (index: number) => {
      const utterance = new SpeechSynthesisUtterance(parts[index]);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = stateRef.current.speed;
      utteranceRef.current = utterance;
      let began = false;
      let activeTime = 0;
      const fail = () => {
        if (utteranceRef.current !== utterance) return;
        cancel();
        setEnabled(false);
        enabledRef.current = false;
        setMessage(
          "読み上げを続けられませんでした。「読み上げ」を押して再試行できます。記事の自動送りは続きます",
        );
      };
      utterance.onstart = () => {
        if (utteranceRef.current !== utterance) return;
        began = true;
        activeTime = 0;
        if (stateRef.current.paused || !stateRef.current.pageVisible)
          window.speechSynthesis.pause();
      };
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        clearInterval(startTimer.current);
        if (index + 1 < parts.length && enabledRef.current && stateRef.current.key === state.key)
          speakPart(index + 1);
        else setFinishedKey(state.key);
      };
      utterance.onerror = fail;
      // Watch only active playback time. Short utterances avoid mobile engine length limits.
      startTimer.current = setInterval(() => {
        if (stateRef.current.paused || !stateRef.current.pageVisible) return;
        activeTime += 250;
        const limit = began ? Math.max(30000, (parts[index].length * 1000) / utterance.rate) : 5000;
        if (activeTime >= limit) fail();
      }, 250);
      // cancel() does not clear global pause; do not resume while user-paused/hidden.
      if (!stateRef.current.paused && stateRef.current.pageVisible) window.speechSynthesis.resume();
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        fail();
      }
    };
    speakPart(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stateRef/enabledRef are stable.
  }, [supported, cancel]);
  const toggle = () => {
    if (enabledRef.current) {
      enabledRef.current = false;
      setEnabled(false);
      cancel();
      setMessage("読み上げを停止しました");
      return;
    }
    if (!supported) {
      setMessage("このブラウザは読み上げに対応していません");
      return;
    }
    enabledRef.current = true;
    setEnabled(true);
    if (!paused && pageVisible) start();
  };
  useEffect(() => {
    cancel();
    setFinishedKey(undefined);
    if (enabledRef.current && key && !stateRef.current.paused && stateRef.current.pageVisible)
      start();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Read policy without restarting on pause.
  }, [key, text, start, cancel]);
  useEffect(() => {
    if (!enabled || !supported) return;
    if (paused || !pageVisible) {
      if (utteranceRef.current) {
        window.speechSynthesis.pause();
      }
    } else if (utteranceRef.current) window.speechSynthesis.resume();
    else if (finishedKey !== key) start();
  }, [enabled, supported, paused, pageVisible, key, finishedKey, start]);
  return {
    enabled,
    toggle,
    holding: enabled && !!key && finishedKey !== key,
    message,
    available: supported && voices.some((voice) => voice.localService === true),
  };
}
