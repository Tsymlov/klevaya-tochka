import { FormEvent, useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import type { FeatureCollection, Point } from "geojson";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  createSpot,
  deleteSpot,
  ensureCsrfCookie,
  getCurrentUser,
  listSpots,
  loginUser,
  logoutUser,
  registerUser,
  updateSpot,
} from "./api";
import type { AuthUser, DraftSpot, Spot } from "./types";

const initialCenter: [number, number] = [37.6176, 55.7558];
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";
const mapStyleUrl = import.meta.env.VITE_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json";
const emptyFeatureCollection: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

function toFeatureCollection(spots: Spot[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: spots.map((spot) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [spot.location.lng, spot.location.lat],
      },
      properties: {
        id: spot.id,
        owner: spot.owner,
        description: spot.description,
        is_owner: spot.is_owner ? 1 : 0,
      },
    })),
  };
}

function toDraftFeatureCollection(draft: DraftSpot | null): FeatureCollection<Point> {
  if (!draft) {
    return emptyFeatureCollection;
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [draft.location.lng, draft.location.lat],
        },
        properties: {
          mode: draft.mode,
        },
      },
    ],
  };
}

function upsertSpot(collection: Spot[], spot: Spot): Spot[] {
  const existingIndex = collection.findIndex((item) => item.id === spot.id);
  if (existingIndex === -1) {
    return [spot, ...collection];
  }

  const next = [...collection];
  next[existingIndex] = spot;
  return next.sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const meRef = useRef<AuthUser>({ is_authenticated: false, username: null });
  const [spots, setSpots] = useState<Spot[]>([]);
  const deferredSpots = useDeferredValue(spots);
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [draftSpot, setDraftSpot] = useState<DraftSpot | null>(null);
  const [viewer, setViewer] = useState<AuthUser>({ is_authenticated: false, username: null });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    username: "",
    password: "",
    passwordConfirm: "",
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [isLoadingSpots, setIsLoadingSpots] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isSpotBusy, setIsSpotBusy] = useState(false);
  const [isTransitionPending, startTransition] = useTransition();

  const selectedSpot = spots.find((spot) => spot.id === selectedSpotId) ?? null;

  function setNotice(message: string | null, error: string | null = null) {
    setStatusMessage(message);
    setErrorMessage(error);
  }

  function syncMapSources(nextSpots: Spot[] = spots, nextDraft: DraftSpot | null = draftSpot) {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const spotsSource = map.getSource("spots") as GeoJSONSource | undefined;
    const draftSource = map.getSource("draft-spot") as GeoJSONSource | undefined;
    if (spotsSource) {
      spotsSource.setData(toFeatureCollection(nextSpots));
    }
    if (draftSource) {
      draftSource.setData(toDraftFeatureCollection(nextDraft));
    }
  }

  async function refreshSpots() {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const bounds = map.getBounds();
    const bbox = [
      bounds.getWest().toFixed(6),
      bounds.getSouth().toFixed(6),
      bounds.getEast().toFixed(6),
      bounds.getNorth().toFixed(6),
    ].join(",");

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setIsLoadingSpots(true);
    try {
      const nextSpots = await listSpots(bbox, controller.signal);
      startTransition(() => {
        setSpots(nextSpots);
      });
      setNotice(`Загружено точек: ${nextSpots.length}`, null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setNotice(null, error instanceof Error ? error.message : "Не удалось загрузить точки.");
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
      setIsLoadingSpots(false);
    }
  }

  function applyIncomingSpot(spot: Spot) {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const normalizedSpot =
      meRef.current.username && meRef.current.username === spot.owner ? { ...spot, is_owner: true } : spot;
    const bounds = map.getBounds();
    const isVisible = bounds.contains([normalizedSpot.location.lng, normalizedSpot.location.lat]);

    startTransition(() => {
      setSpots((current) => {
        if (!isVisible) {
          return current.filter((item) => item.id !== normalizedSpot.id);
        }
        return upsertSpot(current, normalizedSpot);
      });
    });
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrl,
      center: initialCenter,
      zoom: 5,
      pitch: 22,
      bearing: -8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("spots", {
        type: "geojson",
        data: emptyFeatureCollection,
      });
      map.addSource("draft-spot", {
        type: "geojson",
        data: emptyFeatureCollection,
      });

      map.addLayer({
        id: "spots-circles",
        type: "circle",
        source: "spots",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "is_owner"], 1],
            10,
            7,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "is_owner"], 1],
            "#f08c4a",
            "#1a6f8f",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f8f5ef",
          "circle-opacity": 0.92,
        },
      });

      map.addLayer({
        id: "draft-spot-circle",
        type: "circle",
        source: "draft-spot",
        paint: {
          "circle-radius": 11,
          "circle-color": "#ffd166",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#264653",
          "circle-opacity": 0.98,
        },
      });

      map.on("mouseenter", "spots-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "spots-circles", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "spots-circles", (event) => {
        const feature = event.features?.[0];
        const rawId = feature?.properties?.id;
        const spotId = Number(rawId);
        if (!Number.isNaN(spotId)) {
          setDraftSpot(null);
          setSelectedSpotId(spotId);
          setNotice("Точка выбрана.", null);
        }
      });

      map.on("click", (event) => {
        const pickedFeature = map.queryRenderedFeatures(event.point, {
          layers: ["spots-circles"],
        });
        if (pickedFeature.length > 0) {
          return;
        }

        if (!meRef.current.is_authenticated) {
          setNotice(null, "Чтобы поставить точку, войди в аккаунт.");
          return;
        }

        setSelectedSpotId(null);
        setDraftSpot({
          mode: "create",
          location: {
            lat: Number(event.lngLat.lat.toFixed(6)),
            lng: Number(event.lngLat.lng.toFixed(6)),
          },
          description: "",
        });
        setNotice("Новая точка выбрана. Добавь описание и сохрани.", null);
      });

      map.on("moveend", () => {
        void refreshSpots();
      });

      syncMapSources([], null);
      void refreshSpots();
    });

    return () => {
      fetchControllerRef.current?.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    meRef.current = viewer;
    if (mapRef.current) {
      void refreshSpots();
    }
  }, [viewer]);

  useEffect(() => {
    syncMapSources(spots, draftSpot);
  }, [spots, draftSpot]);

  useEffect(() => {
    if (!selectedSpot) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.flyTo({
      center: [selectedSpot.location.lng, selectedSpot.location.lat],
      zoom: Math.max(map.getZoom(), 9),
      essential: true,
    });
  }, [selectedSpot]);

  useEffect(() => {
    if (selectedSpotId !== null && !selectedSpot) {
      setSelectedSpotId(null);
    }
  }, [selectedSpot, selectedSpotId]);

  useEffect(() => {
    let isDisposed = false;
    let reconnectTimer: number | undefined;

    function connect() {
      if (isDisposed) {
        return;
      }

      setWsStatus("connecting");
      const socket = new WebSocket(`${wsBaseUrl}/ws/spots/`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!isDisposed) {
          setWsStatus("open");
        }
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as
          | { type: "connection.ready" }
          | {
              type: "spot.event";
              event: "created" | "updated" | "deleted";
              spot: Spot & { id: number };
            };

        if (payload.type !== "spot.event") {
          return;
        }

        if (payload.event === "deleted") {
          startTransition(() => {
            setSpots((current) => current.filter((spot) => spot.id !== payload.spot.id));
          });
          return;
        }

        applyIncomingSpot(payload.spot);
      };

      socket.onclose = () => {
        if (isDisposed) {
          return;
        }
        setWsStatus("closed");
        reconnectTimer = window.setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      try {
        await ensureCsrfCookie();
        const currentUser = await getCurrentUser(controller.signal);
        if (!controller.signal.aborted) {
          setViewer(currentUser);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setNotice(null, error instanceof Error ? error.message : "Не удалось загрузить сессию.");
        }
      }
    }

    void bootstrap();

    return () => {
      controller.abort();
    };
  }, []);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthBusy(true);
    setNotice(null, null);

    try {
      const nextViewer =
        authMode === "register"
          ? await registerUser({
              username: authForm.username,
              password: authForm.password,
              password_confirm: authForm.passwordConfirm,
            })
          : await loginUser({
              username: authForm.username,
              password: authForm.password,
            });

      setViewer(nextViewer);
      setAuthForm({ username: "", password: "", passwordConfirm: "" });
      setNotice(
        authMode === "register"
          ? "Аккаунт создан, можно добавлять точки."
          : "Вход выполнен, можно ставить метки.",
        null
      );
    } catch (error) {
      setNotice(null, error instanceof Error ? error.message : "Не удалось выполнить вход.");
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleLogout() {
    setIsAuthBusy(true);
    setNotice(null, null);
    try {
      const nextViewer = await logoutUser();
      setViewer(nextViewer);
      setDraftSpot(null);
      setSelectedSpotId(null);
      setNotice("Сессия завершена.", null);
    } catch (error) {
      setNotice(null, error instanceof Error ? error.message : "Не удалось завершить сессию.");
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleDraftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftSpot) {
      return;
    }

    setIsSpotBusy(true);
    setNotice(null, null);

    try {
      if (draftSpot.mode === "create") {
        const createdSpot = await createSpot({
          latitude: draftSpot.location.lat,
          longitude: draftSpot.location.lng,
          description: draftSpot.description,
        });
        startTransition(() => {
          setSpots((current) => upsertSpot(current, createdSpot));
        });
        setSelectedSpotId(createdSpot.id);
        setDraftSpot(null);
        setNotice("Точка сохранена.", null);
      } else {
        const updatedSpot = await updateSpot(draftSpot.spotId, {
          description: draftSpot.description,
        });
        startTransition(() => {
          setSpots((current) => upsertSpot(current, updatedSpot));
        });
        setSelectedSpotId(updatedSpot.id);
        setDraftSpot(null);
        setNotice("Точка обновлена.", null);
      }
    } catch (error) {
      setNotice(null, error instanceof Error ? error.message : "Не удалось сохранить точку.");
    } finally {
      setIsSpotBusy(false);
    }
  }

  async function handleDeleteSpot() {
    if (!selectedSpot || !selectedSpot.is_owner) {
      return;
    }

    const confirmed = window.confirm("Удалить эту точку?");
    if (!confirmed) {
      return;
    }

    setIsSpotBusy(true);
    setNotice(null, null);
    try {
      await deleteSpot(selectedSpot.id);
      startTransition(() => {
        setSpots((current) => current.filter((spot) => spot.id !== selectedSpot.id));
      });
      setSelectedSpotId(null);
      setDraftSpot(null);
      setNotice("Точка удалена.", null);
    } catch (error) {
      setNotice(null, error instanceof Error ? error.message : "Не удалось удалить точку.");
    } finally {
      setIsSpotBusy(false);
    }
  }

  function beginEditSelectedSpot() {
    if (!selectedSpot || !selectedSpot.is_owner) {
      return;
    }

    setDraftSpot({
      mode: "edit",
      spotId: selectedSpot.id,
      location: selectedSpot.location,
      description: selectedSpot.description,
    });
    setNotice("Редактирование открыто.", null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <span className="eyebrow">Публичная карта рыболовных мест</span>
        <h1>КлёваяТочка</h1>
        <p className="lead">
          Карта уже подключена к backend-архитектуре: точки грузятся по области, события идут через
          WebSocket, а свои метки можно создавать после входа.
        </p>

        <div className="status-grid">
          <div className="status-card">
            <div>
              <span className="status-label">Карта</span>
              <strong>{isLoadingSpots ? "Загрузка" : "Готово"}</strong>
            </div>
            <span className={`status-dot ${isLoadingSpots ? "is-warm" : ""}`} aria-hidden="true" />
          </div>
          <div className="status-card">
            <div>
              <span className="status-label">WebSocket</span>
              <strong>{wsStatus}</strong>
            </div>
            <span
              className={`status-dot ${wsStatus !== "open" ? "is-muted" : ""}`}
              aria-hidden="true"
            />
          </div>
          <div className="status-card">
            <div>
              <span className="status-label">Точек в кадре</span>
              <strong>{spots.length}</strong>
            </div>
            <span className="status-count">{viewer.username || "guest"}</span>
          </div>
        </div>

        {(statusMessage || errorMessage) && (
          <section className={`panel notice ${errorMessage ? "notice-error" : "notice-success"}`}>
            <h2>{errorMessage ? "Внимание" : "Статус"}</h2>
            <p>{errorMessage || statusMessage}</p>
          </section>
        )}

        <section className="panel">
          <h2>{viewer.is_authenticated ? "Сессия" : "Вход и регистрация"}</h2>
          {viewer.is_authenticated ? (
            <div className="session-card">
              <div>
                <span className="session-label">Пользователь</span>
                <strong>{viewer.username}</strong>
              </div>
              <button type="button" className="ghost-button" onClick={handleLogout} disabled={isAuthBusy}>
                Выйти
              </button>
            </div>
          ) : (
            <form className="stacked-form" onSubmit={handleAuthSubmit}>
              <div className="tab-row">
                <button
                  type="button"
                  className={authMode === "login" ? "tab-button is-active" : "tab-button"}
                  onClick={() => setAuthMode("login")}
                >
                  Вход
                </button>
                <button
                  type="button"
                  className={authMode === "register" ? "tab-button is-active" : "tab-button"}
                  onClick={() => setAuthMode("register")}
                >
                  Регистрация
                </button>
              </div>

              <label>
                <span>Имя пользователя</span>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, username: event.target.value }))
                  }
                  autoComplete="username"
                  required
                />
              </label>

              <label>
                <span>Пароль</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, password: event.target.value }))
                  }
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  required
                />
              </label>

              {authMode === "register" && (
                <label>
                  <span>Повтори пароль</span>
                  <input
                    type="password"
                    value={authForm.passwordConfirm}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        passwordConfirm: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    required
                  />
                </label>
              )}

              <button type="submit" className="primary-button" disabled={isAuthBusy}>
                {isAuthBusy ? "Отправка..." : authMode === "register" ? "Создать аккаунт" : "Войти"}
              </button>
            </form>
          )}
        </section>

        <section className="panel">
          <h2>
            {draftSpot
              ? draftSpot.mode === "create"
                ? "Новая точка"
                : "Редактирование точки"
              : selectedSpot
                ? "Карточка точки"
                : "Как добавить точку"}
          </h2>

          {draftSpot ? (
            <form className="stacked-form" onSubmit={handleDraftSubmit}>
              <label>
                <span>Координаты</span>
                <input
                  type="text"
                  value={`${draftSpot.location.lat}, ${draftSpot.location.lng}`}
                  readOnly
                />
              </label>
              <label>
                <span>Описание места</span>
                <textarea
                  value={draftSpot.description}
                  onChange={(event) =>
                    setDraftSpot((current) =>
                      current ? { ...current, description: event.target.value } : current
                    )
                  }
                  maxLength={1000}
                  rows={5}
                  required
                />
              </label>

              <div className="action-row">
                <button type="submit" className="primary-button" disabled={isSpotBusy}>
                  {isSpotBusy ? "Сохранение..." : draftSpot.mode === "create" ? "Сохранить точку" : "Обновить"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setDraftSpot(null)}
                  disabled={isSpotBusy}
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : selectedSpot ? (
            <div className="spot-card">
              <div className="spot-meta">
                <span>{selectedSpot.owner}</span>
                <span>{formatDate(selectedSpot.created_at)}</span>
              </div>
              <p>{selectedSpot.description}</p>
              <div className="spot-coordinates">
                {selectedSpot.location.lat}, {selectedSpot.location.lng}
              </div>
              {selectedSpot.is_owner && (
                <div className="action-row">
                  <button type="button" className="primary-button" onClick={beginEditSelectedSpot}>
                    Редактировать
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-button"
                    onClick={handleDeleteSpot}
                    disabled={isSpotBusy}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="helper-text">
              {viewer.is_authenticated
                ? "Кликни по карте, чтобы выбрать место и сохранить новую точку."
                : "Просмотр открыт всем. Чтобы добавить метку, войди или зарегистрируйся."}
            </p>
          )}
        </section>

        <section className="panel panel-muted">
          <h2>Технический статус</h2>
          <dl>
            <div>
              <dt>API</dt>
              <dd>{apiBaseUrl}</dd>
            </div>
            <div>
              <dt>WebSocket</dt>
              <dd>{wsBaseUrl}</dd>
            </div>
            <div>
              <dt>UI</dt>
              <dd>{isTransitionPending ? "Обновление данных..." : "Синхронизировано"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2>Точки в текущем кадре</h2>
          <div className="spot-list">
            {deferredSpots.length === 0 ? (
              <p className="helper-text">Пока нет точек в видимой области карты.</p>
            ) : (
              deferredSpots.map((spot) => (
                <button
                  type="button"
                  key={spot.id}
                  className={selectedSpotId === spot.id ? "spot-list-item is-active" : "spot-list-item"}
                  onClick={() => {
                    setDraftSpot(null);
                    setSelectedSpotId(spot.id);
                  }}
                >
                  <span className="spot-list-head">
                    <strong>{spot.owner}</strong>
                    <span>{formatDate(spot.created_at)}</span>
                  </span>
                  <span className="spot-list-text">{spot.description}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <main className="map-stage">
        <div className="map-chrome">
          <span>Главная карта</span>
          <span>{viewer.is_authenticated ? "Клик по карте создает новую точку" : "Только просмотр"}</span>
        </div>
        <div ref={mapContainerRef} className="map-canvas" />
      </main>
    </div>
  );
}

export default App;
