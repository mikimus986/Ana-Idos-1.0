// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    const MAX_TRANSFERS = 4;
    const MAX_STATES = 10000;
    const MAX_RESULTS = 30;
    const MIN_TRANSFER_TIME = 2;


    // =====================================================
    // NORMALIZACE
    // =====================================================

    function normalizeStop(name) {
        return String(name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // ČAS
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts =
            String(time).trim().split(":");

        if (parts.length !== 2) {
            return 0;
        }

        const h = Number(parts[0]);
        const m = Number(parts[1]);

        if (!Number.isFinite(h) || !Number.isFinite(m)) {
            return 0;
        }

        return h * 60 + m;
    }


    function minutesToTime(minutes) {

        minutes =
            ((Number(minutes) % 1440) + 1440) % 1440;

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
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

    async function loadTimetable(line) {

        line = String(line).trim();

        if (!line) {
            throw new Error("Chybí číslo linky.");
        }

        if (cache.has(line)) {
            return cache.get(line);
        }

        const url =
            `data/timetables/${encodeURIComponent(line)}.json`;

        console.log("NAČÍTÁM:", url);

        const response =
            await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Nelze načíst linku ${line}: HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        if (
            !data ||
            !Array.isArray(data.directions)
        ) {
            throw new Error(
                `Linka ${line} nemá platné directions.`
            );
        }

        cache.set(line, data);

        console.log(
            `Linka ${line} načtena. Směrů: ${data.directions.length}`
        );

        return data;
    }


    // =====================================================
    // ODJEZD
    // =====================================================

    function parseDeparture(value) {

        const text =
            String(value ?? "").trim();

        if (!text) {
            return null;
        }

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
    // VYTVOŘENÍ VŠECH SPOJŮ
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        if (!direction) {
            return trips;
        }

        if (!Array.isArray(direction.stops)) {
            return trips;
        }

        if (!Array.isArray(direction.travelTimes)) {
            return trips;
        }


        // -------------------------------------------------
        // DŮLEŽITÉ:
        // JSON 113 má weekdays / weekends
        // -------------------------------------------------

        let timetable =
            direction[dayType];


        // pojistka pro různé názvy
        if (!timetable) {

            if (dayType === "weekday") {
                timetable =
                    direction.weekdays;
            }

            if (dayType === "weekend") {
                timetable =
                    direction.weekends;
            }

            if (dayType === "weekdays") {
                timetable =
                    direction.weekdays;
            }

            if (dayType === "weekends") {
                timetable =
                    direction.weekends;
            }
        }


        if (!timetable) {
            console.warn(
                `Linka ${line}: není jízdní řád pro ${dayType}`
            );

            return trips;
        }


        // -------------------------------------------------
        // KAŽDÁ HODINA
        // -------------------------------------------------

        for (const hourKey of Object.keys(timetable)) {

            const hour =
                Number(hourKey);

            if (!Number.isFinite(hour)) {
                continue;
            }

            const departures =
                timetable[hourKey];

            if (!Array.isArray(departures)) {
                continue;
            }


            // -------------------------------------------------
            // KAŽDÝ ODJEZD
            // -------------------------------------------------

            for (const departureValue of departures) {

                const parsed =
                    parseDeparture(
                        departureValue
                    );

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    hour * 60 +
                    parsed.minute;


                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination || "";


                // -------------------------------------------------
                // S = zkrácený spoj
                // -------------------------------------------------

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


                // -------------------------------------------------
                // ZASTÁVKY
                // -------------------------------------------------

                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const stopName =
                        direction.stops[i];

                    const travelTime =
                        Number(
                            direction.travelTimes[i]
                        );

                    if (
                        !stopName ||
                        !Number.isFinite(
                            travelTime
                        )
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


                // -------------------------------------------------
                // JEDINEČNÉ ID SPOJE
                // -------------------------------------------------

                const id =
                    [
                        String(line),
                        direction.id || destination,
                        firstTime,
                        parsed.isShortTrip
                            ? "S"
                            : "N"
                    ].join("|");


                trips.push({

                    id,

                    line:
                        String(line),

                    directionId:
                        direction.id || "",

                    destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops
                });
            }
        }


        return trips;
    }


    // =====================================================
    // SPOJE JEDNÉ LINKY
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
            of timetable.directions
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
    // VŠECHNY LINKY
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        const allTrips = [];

        const uniqueLines =
            [
                ...new Set(
                    lineNumbers.map(
                        line =>
                            String(line).trim()
                    )
                )
            ];


        const results =
            await Promise.all(
                uniqueLines.map(
                    async line => {

                        try {

                            return await getTrips(
                                line,
                                dayType
                            );

                        } catch (error) {

                            console.warn(
                                `Linka ${line} se nepodařila načíst:`,
                                error
                            );

                            return [];
                        }
                    }
                )
            );


        for (const trips of results) {

            allTrips.push(
                ...trips
            );
        }


        // -------------------------------------------------
        // KAŽDÝ SPOJ POUZE JEDNOU
        // -------------------------------------------------

        const unique =
            new Map();


        for (const trip of allTrips) {

            if (!trip || !trip.id) {
                continue;
            }

            if (!unique.has(trip.id)) {
                unique.set(
                    trip.id,
                    trip
                );
            }
        }


        const finalTrips =
            [...unique.values()];


        console.log(
            "CELKEM JEDINEČNÝCH SPOJŮ:",
            finalTrips.length
        );


        return finalTrips;
    }


    // =====================================================
    // SEGMENT
    // =====================================================

    function getSegment(
        trip,
        from,
        to
    ) {

        if (
            !trip ||
            !Array.isArray(trip.stops)
        ) {
            return null;
        }


        const fromKey =
            normalizeStop(from);

        const toKey =
            normalizeStop(to);


        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    fromKey
            );


        if (fromIndex === -1) {
            return null;
        }


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    normalizeStop(stop.name) ===
                    toKey
            );


        if (toIndex === -1) {
            return null;
        }


        const departureStop =
            trip.stops[fromIndex];

        const arrivalStop =
            trip.stops[toIndex];


        return {

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            departure:
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes
        };
    }


    // =====================================================
    // SEGMENT Z KONKRÉTNÍ POZICE
    // =====================================================

    function getSegmentFromIndex(
        trip,
        fromIndex,
        to
    ) {

        if (
            !trip ||
            !Array.isArray(trip.stops)
        ) {
            return null;
        }


        const toKey =
            normalizeStop(to);


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    normalizeStop(stop.name) ===
                    toKey
            );


        if (toIndex === -1) {
            return null;
        }


        const departureStop =
            trip.stops[fromIndex];

        const arrivalStop =
            trip.stops[toIndex];


        return {

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                ),

            departure:
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes
        };
    }


    // =====================================================
    // LEG
    // =====================================================

    function makeLeg(
        trip,
        segment,
        from,
        to
    ) {

        return {

            line:
                trip.line,

            directionId:
                trip.directionId,

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

        for (const trip of allTrips) {

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
                segment.departureMinutes <
                wantedTime
            ) {
                continue;
            }


            if (
                mode === "arrival" &&
                segment.arrivalMinutes >
                wantedTime
            ) {
                continue;
            }


            results.push({

                type:
                    "direct",

                id:
                    trip.id,

                line:
                    trip.line,

                directionId:
                    trip.directionId,

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


    // =====================================================
    // INDEX ZASTÁVEK
    // =====================================================

    function buildStopIndex(
        trips
    ) {

        const index =
            new Map();


        for (const trip of trips) {

            for (
                let i = 0;
                i < trip.stops.length;
                i++
            ) {

                const stop =
                    trip.stops[i];

                const key =
                    normalizeStop(
                        stop.name
                    );


                if (!index.has(key)) {
                    index.set(
                        key,
                        []
                    );
                }


                index.get(key).push({

                    trip,

                    index:
                        i
                });
            }
        }


        return index;
    }


    // =====================================================
    // PŘESTUPNÍ SPOJE
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime
    ) {

        const results = [];


        const stopIndex =
            buildStopIndex(
                allTrips
            );


        const startKey =
            normalizeStop(from);


        const starts =
            stopIndex.get(
                startKey
            ) || [];


        if (starts.length === 0) {
            return results;
        }


        const queue = [];


        // -------------------------------------------------
        // START
        // -------------------------------------------------

        for (const occurrence of starts) {

            const trip =
                occurrence.trip;

            const index =
                occurrence.index;

            const stop =
                trip.stops[index];


            if (
                stop.minutes <
                wantedTime
            ) {
                continue;
            }


            // Pokud už tento spoj jede přímo do cíle,
            // necháme ho zpracovat jako přímý spoj.
            if (
                getSegmentFromIndex(
                    trip,
                    index,
                    to
                )
            ) {
                continue;
            }


            queue.push({

                trip,

                stopIndex:
                    index,

                legs: [],

                totalWaiting:
                    0,

                transfers:
                    0,

                visitedTrips:
                    new Set([
                        trip.id
                    ])
            });
        }


        let states = 0;


        // -------------------------------------------------
        // BFS
        // -------------------------------------------------

        while (
            queue.length > 0 &&
            states < MAX_STATES
        ) {

            const state =
                queue.shift();

            states++;


            const currentTrip =
                state.trip;


            const currentIndex =
                state.stopIndex;


            // -------------------------------------------------
            // ZKOUŠÍME KAŽDOU ZASTÁVKU PO CESTĚ
            // -------------------------------------------------

            for (
                let transferIndex =
                    currentIndex + 1;

                transferIndex <
                currentTrip.stops.length;

                transferIndex++
            ) {

                const transferStop =
                    currentTrip.stops[
                        transferIndex
                    ];


                const transferName =
                    transferStop.name;


                const arrival =
                    transferStop.minutes;


                const occurrences =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                for (
                    const occurrence
                    of occurrences
                ) {

                    const nextTrip =
                        occurrence.trip;

                    const nextIndex =
                        occurrence.index;


                    if (
                        nextTrip.id ===
                        currentTrip.id
                    ) {
                        continue;
                    }


                    if (
                        state.visitedTrips.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    const departureStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    const departure =
                        departureStop.minutes;


                    if (
                        departure <
                        arrival +
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    // -------------------------------------------------
                    // PRVNÍ LEG
                    // -------------------------------------------------

                    const currentSegment = {

                        stops:
                            currentTrip.stops.slice(
                                currentIndex,
                                transferIndex + 1
                            ),

                        departure:
                            currentTrip.stops[
                                currentIndex
                            ].time,

                        departureMinutes:
                            currentTrip.stops[
                                currentIndex
                            ].minutes,

                        arrival:
                            transferStop.time,

                        arrivalMinutes:
                            arrival
                    };


                    const currentLeg =
                        makeLeg(
                            currentTrip,
                            currentSegment,
                            currentTrip.stops[
                                currentIndex
                            ].name,
                            transferName
                        );


                    const legs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // -------------------------------------------------
                    // CÍL V DALŠÍ LINCE
                    // -------------------------------------------------

                    const finalSegment =
                        getSegmentFromIndex(
                            nextTrip,
                            nextIndex,
                            to
                        );


                    if (finalSegment) {

                        const finalLeg =
                            makeLeg(
                                nextTrip,
                                finalSegment,
                                transferName,
                                to
                            );


                        const complete =
                            [
                                ...legs,
                                finalLeg
                            ];


                        const journey = {

                            type:
                                "transfer",

                            legs:
                                complete,

                            transfers:
                                complete.length - 1,

                            departure:
                                complete[0].departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                complete[0]
                                    .departureMinutes,

                            arrivalMinutes:
                                finalLeg
                                    .arrivalMinutes,

                            totalWaiting:
                                state.totalWaiting +
                                (
                                    departure -
                                    arrival
                                ),

                            transferStops:
                                complete
                                    .slice(0, -1)
                                    .map(
                                        leg =>
                                            leg.to
                                    )
                        };


                        results.push(
                            journey
                        );


                        continue;
                    }


                    // -------------------------------------------------
                    // MAX 4 PŘESTUPŮ
                    // -------------------------------------------------

                    if (
                        state.transfers >=
                        MAX_TRANSFERS
                    ) {
                        continue;
                    }


                    const visited =
                        new Set(
                            state.visitedTrips
                        );


                    visited.add(
                        nextTrip.id
                    );


                    queue.push({

                        trip:
                            nextTrip,

                        stopIndex:
                            nextIndex,

                        legs,

                        totalWaiting:
                            state.totalWaiting +
                            (
                                departure -
                                arrival
                            ),

                        transfers:
                            state.transfers + 1,

                        visitedTrips:
                            visited
                    });
                }
            }
        }


        console.log(
            "PROZKOUMÁNO STAVŮ:",
            states
        );


        // -------------------------------------------------
        // KAŽDÁ CESTA MAXIMÁLNĚ JEDNOU
        // -------------------------------------------------

        const unique =
            new Map();


        for (const journey of results) {

            const key =
                journey.legs
                    .map(
                        leg =>
                            [
                                leg.line,
                                leg.departure,
                                leg.arrival,
                                normalizeStop(
                                    leg.from
                                ),
                                normalizeStop(
                                    leg.to
                                )
                            ].join(":")
                    )
                    .join("|");


            if (!unique.has(key)) {

                unique.set(
                    key,
                    journey
                );
            }
        }


        return [
            ...unique.values()
        ];
    }


    // =====================================================
    // SKÓRE
    // =====================================================

    function journeyScore(
        journey
    ) {

        const first =
            journey.legs[0];

        const last =
            journey.legs[
                journey.legs.length - 1
            ];


        const transfers =
            journey.legs.length - 1;


        const totalTime =
            last.arrivalMinutes -
            first.departureMinutes;


        const waiting =
            journey.totalWaiting || 0;


        /*
         * Nejprve:
         * - dřívější příjezd
         *
         * potom:
         * - méně přestupů
         *
         * potom:
         * - méně čekání
         *
         * potom:
         * - kratší cesta
         */

        return (
            last.arrivalMinutes * 1000000 +
            transfers * 10000 +
            waiting * 10 +
            totalTime
        );
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
            dayType,
            mode
        );


        if (!from || !to) {
            return [];
        }


        if (
            normalizeStop(from) ===
            normalizeStop(to)
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
        // NAČTENÍ
        // -------------------------------------------------

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "VŠECHNY SPOJE:",
            allTrips.length
        );


        if (allTrips.length === 0) {
            return [];
        }


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


        // -------------------------------------------------
        // PŘESTUPNÍ
        // -------------------------------------------------

        let transfers = [];


        if (
            mode === "departure"
        ) {

            transfers =
                findTransferConnections(
                    allTrips,
                    from,
                    to,
                    wantedTime
                );
        }


        // -------------------------------------------------
        // SPOJENÍ
        // -------------------------------------------------

        const combined =
            [
                ...direct,
                ...transfers
            ];


        // -------------------------------------------------
        // ODSTRANĚNÍ DUPLICIT
        // -------------------------------------------------

        const unique =
            new Map();


        for (
            const connection
            of combined
        ) {

            let key;


            if (
                connection.type ===
                "transfer"
            ) {

                key =
                    connection.legs
                        .map(
                            leg =>
                                [
                                    leg.line,
                                    leg.directionId,
                                    leg.departure,
                                    leg.arrival,
                                    normalizeStop(
                                        leg.from
                                    ),
                                    normalizeStop(
                                        leg.to
                                    )
                                ].join("|")
                        )
                        .join(">>");

            } else {

                key =
                    [
                        "direct",
                        connection.line,
                        connection.directionId,
                        connection.departure,
                        connection.arrival,
                        normalizeStop(
                            connection.from
                        ),
                        normalizeStop(
                            connection.to
                        )
                    ].join("|");
            }


            if (!unique.has(key)) {

                unique.set(
                    key,
                    connection
                );
            }
        }


        let finalResults =
            [
                ...unique.values()
            ];


        // -------------------------------------------------
        // SEŘAZENÍ
        // -------------------------------------------------

        if (
            mode === "departure"
        ) {

            finalResults.sort(
                (a, b) => {

                    const aTime =
                        a.departureMinutes;

                    const bTime =
                        b.departureMinutes;


                    if (
                        aTime !== bTime
                    ) {
                        return (
                            aTime -
                            bTime
                        );
                    }


                    const aTransfers =
                        a.type === "transfer"
                            ? a.transfers
                            : 0;

                    const bTransfers =
                        b.type === "transfer"
                            ? b.transfers
                            : 0;


                    if (
                        aTransfers !==
                        bTransfers
                    ) {
                        return (
                            aTransfers -
                            bTransfers
                        );
                    }


                    return (
                        a.arrivalMinutes -
                        b.arrivalMinutes
                    );
                }
            );

        } else {

            finalResults.sort(
                (a, b) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        console.log(
            "NALEZENÉ SPOJE:",
            finalResults
        );


        // -------------------------------------------------
        // MAX 30 VÝSLEDKŮ
        // -------------------------------------------------

        return finalResults.slice(
            0,
            MAX_RESULTS
        );
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

           
