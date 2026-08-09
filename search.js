// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =========================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =========================================================

    async function loadTimetable(line) {

        line = String(line);

        if (cache.has(line)) {
            return cache.get(line);
        }

        const response = await fetch(
            `data/timetables/${line}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Nelze načíst jízdní řád linky ${line}. HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =========================================================
    // ČAS → MINUTY
    // =========================================================

    function timeToMinutes(time) {

        const parts = String(time).split(":");

        if (parts.length !== 2) {
            return NaN;
        }

        const h = Number(parts[0]);
        const m = Number(parts[1]);

        if (!Number.isFinite(h) || !Number.isFinite(m)) {
            return NaN;
        }

        return h * 60 + m;
    }


    // =========================================================
    // MINUTY → ČAS
    // =========================================================

    function minutesToTime(minutes) {

        minutes = ((minutes % 1440) + 1440) % 1440;

        const h = Math.floor(minutes / 60);
        const m = minutes % 60;

        return (
            String(h).padStart(2, "0") +
            ":" +
            String(m).padStart(2, "0")
        );
    }


    // =========================================================
    // NORMALIZACE NÁZVU ZASTÁVKY
    // =========================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase();
    }


    // =========================================================
    // ODJEZD
    //
    // 22
    // 22S
    // =========================================================

    function parseDeparture(value) {

        const text = String(value).trim();

        const isShortTrip =
            text.toUpperCase().endsWith("S");

        const numberText =
            isShortTrip
                ? text.slice(0, -1)
                : text;

        const minute = Number(numberText);

        if (!Number.isFinite(minute)) {
            return null;
        }

        return {
            minute,
            isShortTrip
        };
    }


    // =========================================================
    // VYTVOŘENÍ SPOJŮ
    // =========================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        const departures = direction[dayType];

        if (!departures) {
            return trips;
        }

        for (const hour of Object.keys(departures)) {

            const values = departures[hour];

            if (!Array.isArray(values)) {
                continue;
            }

            for (const value of values) {

                const parsed = parseDeparture(value);

                if (!parsed) {
                    continue;
                }

                const firstTime =
                    Number(hour) * 60 +
                    parsed.minute;

                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination;


                // =================================================
                // SPOJ S
                // =================================================

                if (parsed.isShortTrip) {

                    const shortStopIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                "sminov, u lávky"
                        );

                    if (shortStopIndex !== -1) {

                        stopCount =
                            shortStopIndex + 1;

                        destination =
                            "Sminov, u lávky";
                    }
                }


                // =================================================
                // ZASTÁVKY
                // =================================================

                const stops = [];

                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    let travelTime =
                        Number(
                            direction.travelTimes?.[i] ?? 0
                        );

                    if (!Number.isFinite(travelTime)) {
                        travelTime = 0;
                    }

                    const absoluteTime =
                        firstTime + travelTime;

                    stops.push({

                        name:
                            direction.stops[i],

                        minutes:
                            absoluteTime,

                        time:
                            minutesToTime(
                                absoluteTime
                            )
                    });
                }


                if (stops.length === 0) {
                    continue;
                }


                trips.push({

                    line:
                        String(line),

                    destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops,

                    departure:
                        stops[0].time,

                    departureMinutes:
                        stops[0].minutes
                });
            }
        }

        return trips;
    }


    // =========================================================
    // VŠECHNY SPOJE LINKY
    // =========================================================

    async function getTrips(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(line);

        const trips = [];

        for (
            const direction
            of timetable.directions || []
        ) {

            trips.push(
                ...createTrips(
                    line,
                    direction,
                    dayType
                )
            );
        }

        return trips;
    }


    // =========================================================
    // VŠECHNY SPOJE
    // =========================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];

        for (
            const line of lineNumbers
        ) {

            try {

                const trips =
                    await getTrips(
                        line,
                        dayType
                    );

                allTrips.push(
                    ...trips
                );

            } catch (error) {

                console.warn(
                    `Linka ${line} se nepodařila načíst:`,
                    error
                );
            }
        }

        return allTrips;
    }


    // =========================================================
    // ÚSEK SPOJE
    // =========================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(from)
            );

        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(to)
            );

        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }

        if (fromIndex >= toIndex) {
            return null;
        }

        return {

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            departure:
                trip.stops[fromIndex].time,

            departureMinutes:
                trip.stops[fromIndex].minutes,

            arrival:
                trip.stops[toIndex].time,

            arrivalMinutes:
                trip.stops[toIndex].minutes
        };
    }


    // =========================================================
    // PŘÍMÉ SPOJE
    // =========================================================

    function findDirectConnectionsFromTrips(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];

        for (
            const trip of allTrips
        ) {

            const segment =
                getSegment(
                    trip,
                    from,
                    to
                );

            if (!segment) {
                continue;
            }


            // =================================================
            // ODJEZDY
            // =================================================

            if (mode === "departure") {

                if (
                    segment.departureMinutes <
                    wantedTime
                ) {
                    continue;
                }
            }


            // =================================================
            // PŘÍJEZDY
            // =================================================

            if (mode === "arrival") {

                if (
                    segment.arrivalMinutes >
                    wantedTime
                ) {
                    continue;
                }
            }


            results.push({

                type:
                    "direct",

                line:
                    trip.line,

                destination:
                    trip.destination,

                isShortTrip:
                    trip.isShortTrip,

                from,

                to,

                departure:
                    segment.departure,

                arrival:
                    segment.arrival,

                departureMinutes:
                    segment.departureMinutes,

                arrivalMinutes:
                    segment.arrivalMinutes,

                stops:
                    segment.stops
            });
        }

        return results;
    }


    // =========================================================
    // KLÍČ PRO DUPLICITU
    // =========================================================

    function connectionKey(connection) {

        if (
            connection.type ===
            "direct"
        ) {

            return [
                "D",
                connection.line,
                connection.departure,
                connection.arrival
            ].join("|");
        }


        if (
            !connection.legs
        ) {
            return "";
        }


        return connection.legs
            .map(
                leg =>
                    [
                        leg.line,
                        leg.departure,
                        leg.arrival
                    ].join("@")
            )
            .join(">>");
    }


    // =========================================================
    // ODSTRANĚNÍ DUPLICIT
    // =========================================================

    function removeDuplicates(
        connections
    ) {

        const seen = new Set();

        const result = [];

        for (
            const connection
            of connections
        ) {

            const key =
                connectionKey(
                    connection
                );

            if (!key) {
                continue;
            }

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            result.push(
                connection
            );
        }

        return result;
    }


    // =========================================================
    // VYTVOŘENÍ PŘESTUPNÍ CESTY
    // =========================================================

    function makeTransferConnection(
        legs
    ) {

        if (
            !legs ||
            legs.length < 2
        ) {
            return null;
        }

        const first = legs[0];
        const last =
            legs[legs.length - 1];

        return {

            type:
                "transfer",

            from:
                first.from,

            to:
                last.to,

            departure:
                first.departure,

            arrival:
                last.arrival,

            departureMinutes:
                first.departureMinutes,

            arrivalMinutes:
                last.arrivalMinutes,

            legs:
                legs.map(
                    leg => ({

                        line:
                            leg.trip.line,

                        destination:
                            leg.trip.destination,

                        isShortTrip:
                            leg.trip.isShortTrip,

                        from:
                            leg.from,

                        to:
                            leg.to,

                        departure:
                            leg.departure,

                        arrival:
                            leg.arrival,

                        departureMinutes:
                            leg.departureMinutes,

                        arrivalMinutes:
                            leg.arrivalMinutes,

                        stops:
                            leg.stops
                    })
                )
        };
    }


    // =========================================================
    // VYHLEDÁNÍ PŘESTUPŮ
    //
    // Algoritmus postupuje po jednotlivých spojích.
    //
    // Nemá pevně nastavený počet přestupů.
    // Zároveň ale nepovolí použití stejné linky znovu,
    // takže se nebude zbytečně točit v kruhu.
    // =========================================================

    function findTransfers(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];

        const queue = [];


        // =====================================================
        // PRVNÍ ÚSEKY
        // =====================================================

        for (
            const trip of allTrips
        ) {

            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(
                            from
                        )
                );

            if (fromIndex === -1) {
                continue;
            }


            const departure =
                trip.stops[
                    fromIndex
                ];


            if (
                mode === "departure" &&
                departure.minutes < wantedTime
            ) {
                continue;
            }


            // Pro arrival musí první spoj samozřejmě
            // také začít před konečným časem.
            if (
                mode === "arrival" &&
                departure.minutes > wantedTime
            ) {
                continue;
            }


            for (
                let i =
                    fromIndex + 1;

                i <
                trip.stops.length;

                i++
            ) {

                const stop =
                    trip.stops[i];


                queue.push({

                    legs: [{

                        trip,

                        from,

                        to:
                            stop.name,

                        departure:
                            departure.time,

                        departureMinutes:
                            departure.minutes,

                        arrival:
                            stop.time,

                        arrivalMinutes:
                            stop.minutes,

                        stops:
                            trip.stops.slice(
                                fromIndex,
                                i + 1
                            )
                    }],

                    currentStop:
                        stop.name,

                    currentTime:
                        stop.minutes,

                    usedLines: [
                        trip.line
                    ]
                });
            }
        }


        // =====================================================
        // OCHRANA PROTI CYKLŮM
        // =====================================================

        const visited =
            new Set();


        // Maximální počet prohledávaných stavů.
        // Není to limit přestupů.
        // Chrání pouze prohlížeč před nekonečným výpočtem.
        const MAX_STATES = 50000;

        let states = 0;


        // =====================================================
        // PROHLEDÁVÁNÍ
        // =====================================================

        while (
            queue.length > 0 &&
            states < MAX_STATES
        ) {

            states++;

            const state =
                queue.shift();


            // =================================================
            // DOSTALI JSME SE DO CÍLE
            // =================================================

            if (
                normalizeStop(
                    state.currentStop
                ) ===
                normalizeStop(to)
            ) {

                if (
                    state.legs.length >= 2
                ) {

                    const connection =
                        makeTransferConnection(
                            state.legs
                        );

                    if (connection) {

                        if (
                            mode === "departure"
                        ) {

                            results.push(
                                connection
                            );

                        } else {

                            if (
                                connection.arrivalMinutes <=
                                wantedTime
                            ) {

                                results.push(
                                    connection
                                );
                            }
                        }
                    }
                }

                continue;
            }


            // =================================================
            // KLÍČ STAVU
            // =================================================

            const stateKey = [

                normalizeStop(
                    state.currentStop
                ),

                state.currentTime,

                state.usedLines.join(",")
            ].join("|");


            if (
                visited.has(
                    stateKey
                )
            ) {
                continue;
            }


            visited.add(
                stateKey
            );


            // =================================================
            // DALŠÍ SPOJE
            // =================================================

            for (
                const nextTrip
                of allTrips
            ) {

                // Stejná linka není nový přestup.
                if (
                    state.usedLines.includes(
                        nextTrip.line
                    )
                ) {
                    continue;
                }


                const transferIndex =
                    nextTrip.stops.findIndex(
                        stop =>
                            normalizeStop(
                                stop.name
                            ) ===
                            normalizeStop(
                                state.currentStop
                            )
                    );


                if (
                    transferIndex === -1
                ) {
                    continue;
                }


                const nextDeparture =
                    nextTrip.stops[
                        transferIndex
                    ];


                // =================================================
                // MUSÍME STIHNOUT PŘESTUP
                // =================================================

                if (
                    nextDeparture.minutes <
                    state.currentTime
                ) {
                    continue;
                }


                // =================================================
                // DALŠÍ ZASTÁVKY
                // =================================================

                for (
                    let i =
                        transferIndex + 1;

                    i <
                    nextTrip.stops.length;

                    i++
                ) {

                    const nextStop =
                        nextTrip.stops[i];


                    const nextLeg = {

                        trip:
                            nextTrip,

                        from:
                            state.currentStop,

                        to:
                            nextStop.name,

                        departure:
                            nextDeparture.time,

                        departureMinutes:
                            nextDeparture.minutes,

                        arrival:
                            nextStop.time,

                        arrivalMinutes:
                            nextStop.minutes,

                        stops:
                            nextTrip.stops.slice(
                                transferIndex,
                                i + 1
                            )
                    };


                    queue.push({

                        legs: [
                            ...state.legs,
                            nextLeg
                        ],

                        currentStop:
                            nextStop.name,

                        currentTime:
                            nextStop.minutes,

                        usedLines: [
                            ...state.usedLines,
                            nextTrip.line
                        ]
                    });
                }
            }
        }


        return removeDuplicates(
            results
        );
    }


    // =========================================================
    // HLAVNÍ FUNKCE
    // =========================================================

    async function findConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers,
        mode = "departure"
    ) {

        const wantedTime =
            timeToMinutes(
                afterTime
            );


        if (
            !Number.isFinite(
                wantedTime
            )
        ) {
            return [];
        }


        if (
            !from ||
            !to
        ) {
            return [];
        }


        // =====================================================
        // VŠECHNY SPOJE
        // =====================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        // =====================================================
        // PŘÍMÉ SPOJE
        // =====================================================

        let direct =
            findDirectConnectionsFromTrips(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        direct =
            removeDuplicates(
                direct
            );


        // =====================================================
        // PŘÍMÉ SPOJE MAJÍ PŘEDNOST
        //
        // Pokud existuje přímý spoj, přestupní cesty
        // se normálně nezobrazí.
        // =====================================================

        if (
            direct.length > 0
        ) {

            direct.sort(
                (a, b) => {

                    if (
                        mode ===
                        "departure"
                    ) {

                        return (
                            a.departureMinutes -
                            b.departureMinutes
                        );
                    }

                    return (
                        b.arrivalMinutes -
                        a.arrivalMinutes
                    );
                }
            );


            return direct.slice(
                0,
                30
            );
        }


        // =====================================================
        // PŘESTUPY
        // =====================================================

        let transfers =
            findTransfers(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        transfers =
            removeDuplicates(
                transfers
            );


        // =====================================================
        // SEŘAZENÍ
        // =====================================================

        transfers.sort(
            (a, b) => {

                const aChanges =
                    a.legs.length - 1;

                const bChanges =
                    b.legs.length - 1;


                // Nejdříve méně přestupů.
                if (
                    aChanges !==
                    bChanges
                ) {

                    return (
                        aChanges -
                        bChanges
                    );
                }


                // Potom podle času.
                if (
                    mode ===
                    "departure"
                ) {

                    if (
                        a.departureMinutes !==
                        b.departureMinutes
                    ) {

                        return (
                            a.departureMinutes -
                            b.departureMinutes
                        );
                    }

                } else {

                    if (
                        a.arrivalMinutes !==
                        b.arrivalMinutes
                    ) {

                        return (
                            b.arrivalMinutes -
                            a.arrivalMinutes
                        );
                    }
                }


                return (
                    a.arrivalMinutes -
                    b.arrivalMinutes
                );
            }
        );


        return transfers.slice(
            0,
            30
        );
    }


    // =========================================================
    // EXPORT
    // =========================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections:
            findDirectConnectionsFromTrips

    };

})();

                       
