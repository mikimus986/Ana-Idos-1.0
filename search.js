// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =====================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

    async function loadTimetable(line) {

        line = String(line).trim();

        if (cache.has(line)) {
            return cache.get(line);
        }

        const response = await fetch(
            `data/timetables/${encodeURIComponent(line)}.json`
        );

        if (!response.ok) {
            throw new Error(
                `Nelze načíst linku ${line}: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        cache.set(line, data);

        return data;
    }


    // =====================================================
    // ČAS
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts = String(time).split(":");

        if (parts.length !== 2) {
            return 0;
        }

        const h = Number(parts[0]);
        const m = Number(parts[1]);

        if (
            !Number.isFinite(h) ||
            !Number.isFinite(m)
        ) {
            return 0;
        }

        return h * 60 + m;
    }


    function minutesToTime(minutes) {

        minutes =
            ((minutes % 1440) + 1440) % 1440;

        const h =
            Math.floor(minutes / 60);

        const m =
            minutes % 60;

        return (
            String(h).padStart(2, "0") +
            ":" +
            String(m).padStart(2, "0")
        );
    }


    // =====================================================
    // ZASTÁVKA
    // =====================================================

    function normalizeStop(name) {

        return String(name)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // ODJEZD
    // =====================================================

    function parseDeparture(value) {

        const text =
            String(value).trim();

        const isShortTrip =
            text.toUpperCase().endsWith("S");

        const numberText =
            isShortTrip
                ? text.slice(0, -1)
                : text;

        const minute =
            Number(numberText);

        if (
            !Number.isFinite(minute) ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        return {
            minute,
            isShortTrip
        };
    }


    // =====================================================
    // VYTVOŘENÍ VŠECH SPOJŮ LINKY
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        let timetable =
            direction[dayType];

        if (!timetable) {

            if (dayType === "weekday") {
                timetable =
                    direction.weekdays;
            }

            if (dayType === "weekend") {
                timetable =
                    direction.weekends;
            }
        }

        if (!timetable) {
            return trips;
        }


        if (!Array.isArray(direction.stops)) {
            return trips;
        }


        for (
            const hour of Object.keys(timetable)
        ) {

            const departures =
                timetable[hour];

            if (!Array.isArray(departures)) {
                continue;
            }


            for (
                const departureValue
                of departures
            ) {

                const parsed =
                    parseDeparture(
                        departureValue
                    );

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    Number(hour) * 60 +
                    parsed.minute;


                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination || "";


                // =================================================
                // SPOJ S
                // =================================================

                if (parsed.isShortTrip) {

                    const shortIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                normalizeStop(
                                    "Sminov, u lávky"
                                )
                        );

                    if (shortIndex !== -1) {

                        stopCount =
                            shortIndex + 1;

                        destination =
                            "Sminov, u lávky";
                    }
                }


                const stops = [];


                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const stopName =
                        direction.stops[i];

                    const travelTime =
                        Number(
                            direction.travelTimes?.[i]
                        );

                    if (
                        !stopName ||
                        !Number.isFinite(travelTime)
                    ) {
                        continue;
                    }


                    const absoluteTime =
                        firstTime +
                        travelTime;


                    stops.push({

                        name:
                            stopName,

                        time:
                            minutesToTime(
                                absoluteTime
                            ),

                        minutes:
                            absoluteTime
                    });
                }


                if (stops.length < 2) {
                    continue;
                }


                trips.push({

                    id:
                        `${line}-${direction.id}-${firstTime}-${parsed.isShortTrip ? "S" : "N"}`,

                    line:
                        String(line),

                    directionId:
                        direction.id,

                    destination:
                        destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops:
                        stops
                });
            }
        }


        return trips;
    }


    // =====================================================
    // SPOJE LINKY
    // =====================================================

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


    // =====================================================
    // VŠECHNY SPOJE
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const promises =
            lineNumbers.map(
                line =>
                    getTrips(
                        line,
                        dayType
                    ).catch(error => {

                        console.warn(
                            `Linka ${line} se nepodařila načíst:`,
                            error
                        );

                        return [];
                    })
            );


        const groups =
            await Promise.all(promises);


        const allTrips =
            groups.flat();


        console.log(
            "CELKEM NAČTENÝCH SPOJŮ:",
            allTrips.length
        );


        return allTrips;
    }


    // =====================================================
    // ÚSEK SPOJE
    // =====================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        const wantedFrom =
            normalizeStop(from);

        const wantedTo =
            normalizeStop(to);


        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    wantedFrom
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    wantedTo
            );


        if (
            fromIndex === -1 ||
            toIndex === -1 ||
            fromIndex >= toIndex
        ) {
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


    // =====================================================
    // PŘÍMÉ SPOJE
    // =====================================================

    function findDirectConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        for (
            const trip
            of allTrips
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


            if (
                mode === "departure" &&
                segment.departureMinutes < wantedTime
            ) {
                continue;
            }


            if (
                mode === "arrival" &&
                segment.arrivalMinutes > wantedTime
            ) {
                continue;
            }


            results.push({

                type:
                    "direct",

                line:
                    trip.line,

                directionId:
                    trip.directionId,

                destination:
                    trip.destination,

                isShortTrip:
                    trip.isShortTrip,

                from:
                    from,

                to:
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
                    segment.stops,

                tripId:
                    trip.id
            });
        }


        return results;
    }


    // =====================================================
    // DUPLICITY
    // =====================================================

    function removeDuplicates(
        connections
    ) {

        const seen =
            new Set();

        const result = [];


        for (
            const connection
            of connections
        ) {

            const key = [
                connection.type,
                connection.line,
                connection.departure,
                connection.arrival,
                connection.from,
                connection.to
            ].join("|");


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


    // =====================================================
    // NAJDI NEJLEPŠÍ SPOJ Z JEDNOHO BODU
    // =====================================================

    function findNextLeg(
        trips,
        fromStop,
        earliestDeparture,
        targetStop
    ) {

        const candidates = [];


        const wanted =
            normalizeStop(fromStop);


        for (
            const trip
            of trips
        ) {

            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(stop.name) ===
                        wanted
                );


            if (fromIndex === -1) {
                continue;
            }


            const departureStop =
                trip.stops[fromIndex];


            if (
                departureStop.minutes <
                earliestDeparture
            ) {
                continue;
            }


            let targetIndex = -1;


            if (targetStop) {

                targetIndex =
                    trip.stops.findIndex(
                        (stop, index) =>
                            index > fromIndex &&
                            normalizeStop(stop.name) ===
                            normalizeStop(targetStop)
                    );


                if (targetIndex === -1) {
                    continue;
                }
            }


            candidates.push({

                trip,
                fromIndex,
                targetIndex,

                departureMinutes:
                    departureStop.minutes,

                arrivalMinutes:
                    targetIndex !== -1
                        ? trip.stops[targetIndex].minutes
                        : null
            });
        }


        candidates.sort(
            (a, b) =>
                (
                    a.arrivalMinutes ??
                    a.departureMinutes
                ) -
                (
                    b.arrivalMinutes ??
                    b.departureMinutes
                )
        );


        return candidates;
    }


    // =====================================================
    // VYTVOŘENÍ ÚSEKU
    // =====================================================

    function makeLeg(
        trip,
        fromIndex,
        toIndex
    ) {

        if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= toIndex
        ) {
            return null;
        }


        const stops =
            trip.stops.slice(
                fromIndex,
                toIndex + 1
            );


        return {

            line:
                trip.line,

            directionId:
                trip.directionId,

            destination:
                trip.destination,

            isShortTrip:
                trip.isShortTrip,

            from:
                stops[0].name,

            to:
                stops[stops.length - 1].name,

            departure:
                stops[0].time,

            arrival:
                stops[stops.length - 1].time,

            departureMinutes:
                stops[0].minutes,

            arrivalMinutes:
                stops[stops.length - 1].minutes,

            stops:
                stops,

            tripId:
                trip.id
        };
    }


    // =====================================================
    // PŘESTUPNÍ SPOJE
    //
    // MAXIMÁLNĚ 4 PŘESTUPY
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        // -------------------------------------------------
        // Pro rychlost vynecháme přestupy při režimu
        // příjezdu. Nejdříve hledáme přímé spoje.
        // -------------------------------------------------

        if (mode !== "departure") {
            return results;
        }


        const fromNorm =
            normalizeStop(from);

        const toNorm =
            normalizeStop(to);


        // -------------------------------------------------
        // SPOJE, KTERÉ MOHOU ZAČÍT Z FROM
        // -------------------------------------------------

        const startingTrips = [];


        for (
            const trip
            of allTrips
        ) {

            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(stop.name) ===
                        fromNorm
                );


            if (fromIndex === -1) {
                continue;
            }


            if (
                trip.stops[fromIndex].minutes <
                wantedTime
            ) {
                continue;
            }


            startingTrips.push({

                trip,
                fromIndex
            });
        }


        // -------------------------------------------------
        // PRIORITNÍ FRONTa
        // -------------------------------------------------

        const queue = [];


        for (
            const start
            of startingTrips
        ) {

            queue.push({

                legs: [],

                currentStop:
                    from,

                currentTime:
                    start.trip.stops[
                        start.fromIndex
                    ].minutes,

                usedTrips:
                    new Set(),

                usedLines:
                    new Set()
            });
        }


        // -------------------------------------------------
        // OMEZENÍ
        // -------------------------------------------------

        const MAX_TRANSFERS = 4;

        const MAX_RESULTS = 20;

        const MAX_STATES = 5000;


        let processedStates = 0;


        // Stav navštívených kombinací
        const visited =
            new Map();


        while (
            queue.length > 0 &&
            processedStates < MAX_STATES &&
            results.length < MAX_RESULTS
        ) {

            processedStates++;


            // Nejbližší stav
            queue.sort(
                (a, b) =>
                    a.currentTime -
                    b.currentTime
            );


            const state =
                queue.shift();


            // -------------------------------------------------
            // PROJDI SPOJE, KTERÉ LZE CHYTIT
            // -------------------------------------------------

            const possible =
                findNextLeg(
                    allTrips,
                    state.currentStop,
                    state.currentTime,
                    to
                );


            // -------------------------------------------------
            // PŘÍMÁ CESTA Z AKTUÁLNÍ ZASTÁVKY
            // -------------------------------------------------

            for (
                const candidate
                of possible.slice(0, 8)
            ) {

                const leg =
                    makeLeg(
                        candidate.trip,
                        candidate.fromIndex,
                        candidate.targetIndex
                    );


                if (!leg) {
                    continue;
                }


                // Pokud jsme už měli alespoň jednu část,
                // vzniká přestupní cesta.
                if (state.legs.length > 0) {

                    const legs =
                        [
                            ...state.legs,
                            leg
                        ];


                    results.push({

                        type:
                            "transfer",

                        legs:
                            legs,

                        from:
                            from,

                        to:
                            to,

                        departure:
                            legs[0].departure,

                        arrival:
                            leg.arrival,

                        departureMinutes:
                            legs[0].departureMinutes,

                        arrivalMinutes:
                            leg.arrivalMinutes,

                        transfers:
                            legs.length - 1
                    });
                }
            }


            // -------------------------------------------------
            // UŽ 4 PŘESTUPY?
            // -------------------------------------------------

            if (
                state.legs.length >=
                MAX_TRANSFERS
            ) {
                continue;
            }


            // -------------------------------------------------
            // VŠECHNY ZASTÁVKY AKTUÁLNÍHO SPOJE
            // -------------------------------------------------

            let firstTrip = null;


            if (state.legs.length === 0) {

                // Najdeme vhodný první spoj
                for (
                    const start
                    of startingTrips
                ) {

                    if (
                        start.trip.stops[
                            start.fromIndex
                        ].minutes ===
                        state.currentTime
                    ) {

                        firstTrip =
                            start;

                        break;
                    }
                }

            } else {

                // poslední spoj
                const lastLeg =
                    state.legs[
                        state.legs.length - 1
                    ];

                firstTrip =
                    allTrips.find(
                        trip =>
                            trip.id ===
                            lastLeg.tripId
                    );

            }


            if (!firstTrip) {
                continue;
            }


            const trip =
                firstTrip.trip;

            const fromIndex =
                firstTrip.fromIndex;


            // -------------------------------------------------
            // HLEDÁNÍ PŘESTUPNÍCH ZASTÁVEK
            // -------------------------------------------------

            for (
                let i = fromIndex + 1;
                i < trip.stops.length;
                i++
            ) {

                const transferStop =
                    trip.stops[i];


                // Pokud jsme už v cíli, dál není třeba jet
                if (
                    normalizeStop(
                        transferStop.name
                    ) === toNorm
                ) {
                    continue;
                }


                // -------------------------------------------------
                // Další spoj musí odjet až po příjezdu.
                // 1 minuta na přestup.
                // -------------------------------------------------

                const earliest =
                    transferStop.minutes + 1;


                const nextTrips =
                    findNextLeg(
                        allTrips,
                        transferStop.name,
                        earliest,
                        to
                    );


                // -------------------------------------------------
                // Vezmeme jen několik nejlepších možností
                // -------------------------------------------------

                for (
                    const candidate
                    of nextTrips.slice(0, 5)
                ) {

                    if (
                        candidate.trip.id ===
                        trip.id
                    ) {
                        continue;
                    }


                    // stejná linka nemá smysl jako přestup
                    if (
                        state.usedLines.has(
                            candidate.trip.line
                        )
                    ) {
                        continue;
                    }


                    const firstLeg =
                        makeLeg(
                            trip,
                            fromIndex,
                            i
                        );


                    if (!firstLeg) {
                        continue;
                    }


                    const key = [

                        transferStop.name,

                        candidate.trip.id,

                        candidate.trip.stops[
                            candidate.fromIndex
                        ].minutes,

                        state.legs.length + 1

                    ].join("|");


                    if (
                        visited.has(key)
                    ) {
                        continue;
                    }


                    visited.set(
                        key,
                        true
                    );


                    const newLegs = [
                        ...state.legs,
                        firstLeg
                    ];


                    queue.push({

                        legs:
                            newLegs,

                        currentStop:
                            transferStop.name,

                        currentTime:
                            candidate.trip.stops[
                                candidate.fromIndex
                            ].minutes,

                        usedTrips:
                            new Set([
                                ...state.usedTrips,
                                trip.id
                            ]),

                        usedLines:
                            new Set([
                                ...state.usedLines,
                                trip.line
                            ])
                    });
                }
            }
        }


        return results;
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICIT PŘESTUPŮ
    // =====================================================

    function removeTransferDuplicates(
        connections
    ) {

        const seen =
            new Set();

        const result = [];


        for (
            const connection
            of connections
        ) {

            const legs =
                connection.legs || [];


            const key =
                legs.map(
                    leg =>
                        [
                            leg.line,
                            leg.tripId,
                            leg.from,
                            leg.to
                        ].join(":")
                ).join("|");


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            result.push(
                connection
            );
        }


        return result;
    }


    // =====================================================
    // SEŘAZENÍ PŘESTUPŮ
    // =====================================================

    function sortTransfers(
        connections
    ) {

        connections.sort(
            (a, b) => {

                // Nejprve příjezd
                if (
                    a.arrivalMinutes !==
                    b.arrivalMinutes
                ) {

                    return (
                        a.arrivalMinutes -
                        b.arrivalMinutes
                    );
                }


                // Potom méně přestupů
                return (
                    a.transfers -
                    b.transfers
                );
            }
        );


        return connections;
    }


    // =====================================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // =====================================================

    async function findConnections(
        from,
        to,
        afterTime,
        dayType,
        lineNumbers,
        mode = "departure"
    ) {

        console.log(
            "VYHLEDÁVÁNÍ:",
            from,
            "→",
            to,
            afterTime,
            dayType
        );


        if (
            !from ||
            !to
        ) {
            return [];
        }


        if (
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {
            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        // -------------------------------------------------
        // NAČTENÍ VŠECH JÍZDNÍCH ŘÁDŮ
        // -------------------------------------------------

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyl načten žádný spoj."
            );

            return [];
        }


        console.log(
            "Začínám hledat přímé spoje..."
        );


        // -------------------------------------------------
        // PŘÍMÉ
        // -------------------------------------------------

        let direct =
            findDirectConnections(
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


        direct.sort(
            (a, b) =>
                mode === "departure"
                    ? a.departureMinutes -
                      b.departureMinutes
                    : a.arrivalMinutes -
                      b.arrivalMinutes
        );


        console.log(
            "Přímých spojů:",
            direct.length
        );


        // -------------------------------------------------
        // PŘESTUPY
        // -------------------------------------------------

        let transfers = [];


        // Přestupy hledáme pouze pokud dávají smysl.
        // Pokud existuje přímý spoj, stále je dovolíme,
        // ale později je odstraníme, pokud nejsou rychlejší.
        if (
            mode === "departure"
        ) {

            console.log(
                "Hledám přestupní spojení..."
            );


            transfers =
                findTransferConnections(
                    allTrips,
                    from,
                    to,
                    wantedTime,
                    mode
                );


            transfers =
                removeTransferDuplicates(
                    transfers
                );


            transfers =
                sortTransfers(
                    transfers
                );


            console.log(
                "Přestupních spojů:",
                transfers.length
            );
        }


        // -------------------------------------------------
        // PŘESTUPY, KTERÉ NEJSOU RYCHLEJŠÍ NEŽ PŘÍMÉ,
        // ODSTRANÍME
        // -------------------------------------------------

        if (
            direct.length > 0
        ) {

            const fastestDirect =
                direct[0].arrivalMinutes;


            transfers =
                transfers.filter(
                    connection =>
                        connection.arrivalMinutes <
                        fastestDirect
                );
        }


        // -------------------------------------------------
        // VÝSLEDKY
        //
        // Přímé spoje mají přednost.
        // Přestupy se zobrazí pouze tehdy,
        // když jsou rychlejší.
        // -------------------------------------------------

        const finalResults = [
            ...direct.slice(0, 30),
            ...transfers.slice(0, 10)
        ];


        console.log(
            "CELKEM VÝSLEDKŮ:",
            finalResults.length
        );


        return finalResults;
    }


    // =====================================================
    // EXPORT
    // =====================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections
    };

})();
