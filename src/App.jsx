import { useState, useEffect } from 'react';
import BASE_URL from './config';
import { PRESET_LOCATIONS } from './constants/locations';


export default function App() {
  // 1. System Health State
  const [health, setHealth] = useState({
    last_successful_poll_time: null,
    minutes_since_last_success: null,
    success_rate_last_hour: 0,
    consecutive_failures: 0,
    last_error: null,
    initial_historical_backfill_completed: false,
    is_loading: true,
    connection_error: false
  });

  // This will hold the array data when the backend returns it
  const [dashboardData, setDashboardData] = useState(null);
  const [globalAlert, setGlobalAlert] = useState(null);
  // This tracks whether we are loading the dashboard metrics from the backend
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedLocations, setSelectedLocations] = useState([]);
  // Tracks which time window is active (defaults to "24h")
  const [windowFilter, setWindowFilter] = useState("24h");
  const [locationError, setLocationError] = useState(false);
  // Holds incoming earthquake event entries
  const [events, setEvents] = useState([]);

  const [chatId, setChatId] = useState("");

  const [submitError, setSubmitError] = useState("");

  // 2. Simple health fetch function
  const fetchHealth = async () => {
    try {
      const response = await fetch(`${BASE_URL}/system-health`);
      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      setHealth({
        ...data,
        is_loading: false,
        connection_error: false
      });
    } catch (error) {
      console.error("Failed fetching health data:", error);
      setHealth(prev => ({ 
        ...prev, 
        is_loading: false, 
        connection_error: true 
      }));
    }
  };

  // 3. Network fetch worker matching your FastAPI /events configuration
  const fetchEvents = async () => {
    try {
      const response = await fetch(`${BASE_URL}/events?window=${windowFilter}`);
      if (!response.ok) throw new Error("Server error fetching events");
      
      const data = await response.json();
      setEvents(data); 
    } catch (error) {
      console.error("Failed fetching event data:", error);
    }
  };

  // 4. Health polling hook (10 mins)
  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); 
    return () => clearInterval(interval);
  }, []);

  // 5. Automated event polling manager bound directly to your nav configuration
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => clearInterval(interval);
  }, [windowFilter]);

  // 6. Status text assignment
  let statusText = "🟢 Running";
  if (health.connection_error) {
    statusText = "🔴 Frontend Connection Error";
  } else if (health.consecutive_failures > 0) {
    statusText = `⚠️ Failing (${health.consecutive_failures} failures)`;
  } else if (health.is_loading) {
    statusText = "⚪ Fetching...";
  }

const handleLocationToggle = (locationName) => {
  const existing = selectedLocations.find((item) => item.location === locationName);

  // REMOVE
  if (existing) {
    setSelectedLocations(
      selectedLocations.filter((item) => item.location !== locationName)
    );
    setLocationError(false);
    return;
  }

  // BLOCK 4TH SELECTION
  if (selectedLocations.length >= 3) {
    setLocationError(true);
    return;
  }

  // ADD
  setSelectedLocations([
    ...selectedLocations,
    { location: locationName, radius_km: 500 }
  ]);
  setLocationError(false);
};

const handleRadiusChange = (locationName, value) => {
  setSelectedLocations(
    selectedLocations.map((item) =>
      item.location === locationName
        ? { ...item, radius_km: parseInt(value) || 0 }
        : item
    )
  );
};



const handleDashboardRequest = async () => {
  let hasError = false;

  // Basic validation checks
  if (!chatId.trim()) {
    setSubmitError("Telegram Chat ID is required.");
    hasError = true;
  } else if (selectedLocations.length === 0) {
    setSubmitError("Please select at least one location.");
    hasError = true;
  }

  if (hasError) return;
  setSubmitError("");
  setIsSubmitting(true);

  // 1. FORMAT THE PAYLOAD DATA WITH IDS & COORDINATES
  const formattedLocations = selectedLocations.map((item) => {
    // Find matching preset to copy original metadata fields
    const originalPreset = PRESET_LOCATIONS.find(p => p.location === item.location);
    
    return {
      location_id: originalPreset?.location_id || 1,
      location: item.location,
      latitude: originalPreset?.latitude || 0.0,
      longitude: originalPreset?.longitude || 0.0,
      radius_km: parseInt(item.radius_km) || 500
    };
  });

  // 2. CONSTRUCT THE VERIFIED REQUEST PAYLOAD
  const requestBody = {
    chat_id: parseInt(chatId),
    locations: formattedLocations
  };

  // 3. LOOK HERE: PRINTING TO BROWSER CONSOLE LOG
  console.log("==========================================");
  console.log("🚀 OUTGOING BACKEND REQUEST BODY:");
  console.log(JSON.stringify(requestBody, null, 2));
  console.log("==========================================");

try {
    const response = await fetch(`${BASE_URL}/location-dashboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody) 
    });

    // 1. If backend returns an error status (like our 400 or 500)
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Dashboard fetch failed.");
    }
    
    // 2. If valid response
    const data = await response.json();
    setDashboardData(data.locations); 

  } catch (error) {
    console.error("Dashboard error caught:", error);
    
    // 3. THIS WILL TRIGGER THE BROWSER POPUP WINDOW ON TOP OF THE PAGE
    window.alert(`⚠️ System Message:\n\n${error.message}`);
    setGlobalAlert(error.message);
  } finally {
    setIsSubmitting(false);
  }
};





  return (
    <div className="min-h-screen bg-white p-2">


{/* GLOBAL TOP-ROW NOTIFICATION BANNER */}
    {globalAlert && (
      <div className="bg-red-50 text-red-800 border-b border-black px-4 py-2 text-xs font-mono flex justify-between items-center animate-pulse">
        <span>
          ⚠️ <strong>Validation Alert:</strong>{" "}
          {globalAlert.includes("t.me") ? (
            <span>
              Telegram Chat ID not found. Please visit our bot at{" "}
              <a 
                href="https://t.me/kansha_eq_alert_bot" 
                target="_blank" 
                rel="noreferrer"
                className="underline font-bold text-black bg-yellow-200 px-1"
              >
                t.me/kansha_eq_alert_bot
              </a>{" "}
              and click Start.
            </span>
          ) : (
            globalAlert
          )}
        </span>
        <button 
          onClick={() => setGlobalAlert(null)} 
          className="border border-black px-1.5 ml-4 font-bold bg-white text-black hover:bg-gray-100"
        >
          Dismiss
        </button>
      </div>
    )}




      <div className="w-full h-[calc(100vh-16px)] border-2 border-black flex flex-col">

        {/* 1. TOP BOX (System Health Table) */}
        <div className="h-[20%] w-full border-b-2 border-black p-2">
          <div className="w-full h-full border border-black flex justify-between items-center px-4">
            <div><strong>Status:</strong> {statusText}</div>
            <div>
              <strong>Last Poll:</strong> {
                health.minutes_since_last_success !== null 
                  ? `${health.minutes_since_last_success}m ago` 
                  : "Never"
              }
            </div>
            <div><strong>Success Rate (1h):</strong> {health.success_rate_last_hour}%  </div>
            <div>
              <strong>Historical Backfill:</strong> {
                health.initial_historical_backfill_completed 
                  ? "Completed ✅" 
                  : "In Progress ⏳"
              }
            </div>
          </div>
        </div>

        {/* 2. BOTTOM BOX */}
        <div className="h-[80%] w-full p-2 flex gap-2">
          
          {/* LEFT SIDE BOX (Global View - 50% Width) */}
          <div className="w-1/2 h-full border border-black p-4 flex flex-col gap-4">
            
            <h2 className="font-bold border-b border-black pb-2">🌐 Global View</h2>
            
            {/* Minimal Filter Navbar row */}
            <div className="flex gap-2 text-xs">
              {["1h", "24h", "7d", "30d"].map((timeWindow) => {
                const isActive = windowFilter === timeWindow;
                return (
                  <button
                    key={timeWindow}
                    onClick={() => setWindowFilter(timeWindow)}
                    className={`px-3 py-1 border border-black transition-colors ${
                      isActive 
                        ? "bg-black text-white" 
                        : "bg-white text-black hover:bg-gray-100" 
                    }`}
                  >
                    {timeWindow}
                  </button>
                );
              })}
            </div>

            {/* Info metrics status bar */}
            <div className="flex justify-between text-xs text-gray-400 italic">
              <span>Active Window: {windowFilter}</span>
              <span>Total Displayed: {events.length}</span>
            </div>

            {/* 📜 LIVE SCROLLABLE INCIDENT LIST */}
            <div className="border border-black flex-1 overflow-y-auto p-2 flex flex-col gap-2 bg-gray-50/50">
              {events.length === 0 ? (
                <p className="text-xs text-gray-400 italic p-2">No data entries recorded for this time window.</p>
              ) : (
                events.map((event) => {
                  const currentSig = event.sig || 0;

                  // Dynamic UI styles calculated entirely from the Significance value scale
                  let badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-300 font-medium"; 
                  let containerStyle = "border-gray-200 hover:bg-emerald-50/30";
                  let dotColor = "bg-emerald-500 ring-emerald-100";
                  let severityLabel = "Low Impact";

                  if (currentSig >= 600) {
                    // Critical Threat Tier (Crimson Red Theme)
                    badgeClass = "bg-red-600 text-white border-red-700 font-extrabold animate-pulse";
                    containerStyle = "border-l-4 border-l-red-600 border-y-red-200 border-r-red-200 bg-red-50/40 hover:bg-red-50/60";
                    dotColor = "bg-red-600 ring-red-200";
                    severityLabel = "CRITICAL";
                  } else if (currentSig >= 300) {
                    // Warning Threat Tier (Amber Orange Theme)
                    badgeClass = "bg-amber-100 text-amber-800 border-amber-400 font-bold";
                    containerStyle = "border-l-4 border-l-amber-500 border-y-amber-100 border-r-amber-100 bg-amber-50/30 hover:bg-amber-50/50";
                    dotColor = "bg-amber-500 ring-amber-200";
                    severityLabel = "ELEVATED";
                  }

                  return (
                    <div 
                      key={event.id} 
                      className={`border p-3 text-xs flex justify-between items-center bg-white transition-all rounded shadow-sm ${containerStyle}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          {/* Alert ring status dot */}
                          <span className={`w-2.5 h-2.5 rounded-full inline-block ring-4 ${dotColor}`} />
                          <span className="font-bold text-gray-900">{event.place || "Unknown Location"}</span>
                        </div>
                        
                        <div className="text-gray-500 text-[10px] mt-1.5 flex gap-2 items-center">
                          <span className="font-mono font-semibold bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                            M {event.mag ? event.mag.toFixed(1) : "0.0"}
                          </span>
                          <span>•</span>
                          <span>
                            Impact: <span className={`font-bold ${
                              severityLabel === 'CRITICAL' ? 'text-red-600' :
                              severityLabel === 'ELEVATED' ? 'text-amber-700' : 'text-emerald-700'
                            }`}>{severityLabel}</span>
                          </span>
                          
                          {event.tsunami === 1 && (
                            <span className="text-red-700 font-bold font-mono tracking-tighter bg-red-100 border border-red-300 px-1 rounded">
                              ⚠️ TSUNAMI RISK
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Bold Right Side Badge block showing Significance score */}
                      <div className="text-right">
                        <div className={`font-mono border px-3 py-1.5 text-xs min-w-[70px] text-center rounded tracking-tighter ${badgeClass}`}>
                          SIG {currentSig}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* RIGHT SIDE BOX (Per-Location View - 50% Width) */}




{/* RIGHT SIDE BOX (Per-Location View - 50% Width) */}
          <div className="w-1/2 h-full border border-black p-4 flex flex-col gap-2">

            {/* HEADER BLOCK */}
            <div className="flex justify-between items-center border-b border-black pb-2">
              <h2 className="font-bold">
                📍 Per-Location View
              </h2>
              
              {/* If we are on the response page, show the "Go Back" switch */}
              {dashboardData && (
                <button 
                  onClick={() => setDashboardData(null)}
                  className="text-xs border border-black px-2 py-0.5 font-mono bg-black text-white hover:bg-gray-800"
                >
                  ← Go Back To Form
                </button>
              )}
            </div>

            {/* SCREEN PAGE A: INITIAL INPUT FORM VIEW */}
            {!dashboardData ? (
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                
                {/* SECTION 1 — TELEGRAM CHAT ID */}
                <div className="border border-black p-2">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-sm">
                      Telegram Chat ID (Mandatory field)
                    </h3>
                    {submitError === "Telegram Chat ID is required." && (
                      <p className="text-red-600 text-xs">Telegram Chat ID is required.</p>
                    )}
                  </div>
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="Enter Telegram Chat ID"
                    className="w-full border border-black px-3 py-2 text-sm outline-none"
                  />
                </div>

                {/* SECTION 2 — LOCATION SELECTION */}
                <div className="border border-black p-4 flex-1 overflow-y-auto">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-semibold text-sm">
                      Select up to 3 Locations
                    </h3>
                    {submitError === "Please select at least one location." && (
                      <p className="text-red-600 text-xs">Select at least one location.</p>
                    )}
                  </div>
                  {locationError && (
                    <p className="text-red-600 text-xs mb-1">
                      Only up to 3 locations are allowed.
                    </p>
                  )}

                  <div className="flex flex-col gap-2 text-sm">
                    {PRESET_LOCATIONS.map((loc) => {
                      const activeConfig = selectedLocations.find(item => item.location === loc.location);
                      const isChecked = !!activeConfig;

                      return (
                        <div key={loc.location} className="flex justify-between items-center h-5">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleLocationToggle(loc.location)}
                            />
                            {loc.location}
                          </label>

                          {isChecked && (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={activeConfig.radius_km}
                                onChange={(e) => handleRadiusChange(loc.location, e.target.value)}
                                className="w-12 border border-black text-center text-xs h-5 outline-none font-mono"
                              />
                              <span className="text-[10px] text-gray-500 font-mono">km</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 3 — SUBMIT BUTTON */}
                <div className="border border-black p-2 flex justify-center">
                  <button
                    onClick={handleDashboardRequest}
                    disabled={isSubmitting}
                    className="border border-black px-4 py-2 text-sm hover:bg-gray-100 font-mono font-bold w-full"
                  >
                    {isSubmitting ? "Loading Response Data..." : "Get Dashboard Data"}
                  </button>
                </div>

              </div>
            ) : (
              
              /* SCREEN PAGE B: RESPONSE DASHBOARD VIEW */
              <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
                {dashboardData.map((data) => (
                  <div key={data.location} className="border border-black p-2.5 bg-gray-50 flex flex-col gap-1.5 text-xs">
                    
                    {/* Location Name & Computed Risk Score */}
                    <div className="flex justify-between items-center border-b border-black pb-1 font-mono">
                      <span className="font-bold">📍 {data.location}</span>
                      <span className="bg-black text-white px-1.5 text-[10px] font-bold">
                        RISK SCORE: {data.risk_score}
                      </span>
                    </div>

                    {/* Active Threshold Rule Display */}
                    {/* Active Threshold Rule Display */}
                    <p className="text-[10px] text-red-600 font-bold italic bg-red-50 p-1 ">
                      Active Rule: Next alert fires if mag ≥ 4.0 within {data.radius_km} km.
                    </p>

                    {/* 24h / 7d / 30d Activity Accumulations */}
                    <div className="grid grid-cols-3 gap-1 text-center font-mono text-[10px] bg-white border border-black p-1">
                      <div>24h: <strong>{data.local_activity.count_24h}</strong></div>
                      <div>7d: <strong>{data.local_activity.count_7d}</strong></div>
                      <div>30d: <strong>{data.local_activity.count_30d}</strong></div>
                    </div>

                    {/* Largest Event Identifier */}
                    <div className="p-1 border border-black bg-white font-mono text-[10px]">
                      💥 Peak Local Event Magnitude: <strong className="text-red-600">{data.local_activity.largest_magnitude || "0.0"}</strong>
                    </div>

                    {/* Scrollable list of exact historical incidents */}
                    <div>
                      <span className="font-bold text-[9px] uppercase block mb-0.5">Nearby Incidents Feed:</span>
                      <div className="max-h-20 overflow-y-auto border border-black bg-white p-1 flex flex-col gap-1 text-[9px] font-mono">
                        {data.nearby_events.length === 0 ? (
                          <p className="text-gray-400 italic p-1">No local activity inside custom radius.</p>
                        ) : (
                          data.nearby_events.map((event) => (
                            <div key={event.id} className="border-b border-gray-100 last:border-0 pb-0.5 flex justify-between gap-1">
                              <span className="font-bold text-red-600 bg-red-50 px-1">M:{event.mag}</span>
                              <span className="truncate flex-1 text-gray-700">{event.place}</span>
                              <span className="text-gray-400 whitespace-nowrap text-[11px] ">{event.distance_km.toFixed(0)}km away</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>





        </div>

      </div>
    </div>
  );
}