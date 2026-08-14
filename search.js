// search.js

window.searchTimetable = (() => {

    // =========================================================
    // NASTAVENÍ
    // =========================================================

    const cache = new Map();

    const MAX_TRANSFERS = 4;
    const MAX_RESULTS = 20;

    // Minimální čas na přestup
    const MIN_TRANSFER_TIME = 2;

    // Maximální počet prohledaných stavů
    const MAX_STATES = 10000;


    // =========================================================
    // NORMALIZACE
    // =========================================================

    function normalizeStop(name) {

        return String(name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =========================================================
    // ČAS → MINUTY
    // =========================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }

        const parts =
            String(time)
                .trim()
                .split(":");

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


    // =========================================================
    // MINUTY → ČAS
    // =========================================================

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


    // =========================================================
    // ODJEZD Z JÍZDNÍHO ŘÁDU
    //
    // 15
    // 15S
    // =========================================================

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


    // =========================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =========================================================

    async function loadTimetable(line) {

        line =
            String(line).trim();

        if (!line) {
            throw new Error(
                "Chybí číslo linky."
            );
        }

        if (cache.has(line)) {
            return cache.get(line);
        }

        const url =
            `data/timetables/${encodeURIComponent(line)}.json`;

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
                `Jízdní řád linky ${line} nemá platné directions.`
            );
        }

        cache.set(
            line,
            data
        );

        return data;
    }


    // =========================================================
    // VYTVOŘENÍ VŠECH JÍZD JEDNOHO SMĚRU
    // =========================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        if (
            !direction ||
            !Array.isArray(direction.stops) ||
            !Array.isArray(direction.travelTimes)
        ) {
            return trips;
        }


        // -----------------------------------------------------
        // NAČTENÍ SPRÁVNÉHO TYPU DNE
        // -----------------------------------------------------

        let timetable =
            direction[dayType];

        if (
            !timetable &&
            dayType === "weekend"
        ) {
            timetable =
                direction.weekends;
        }

        if (
            !timetable &&
            dayType === "weekday"
        ) {
            timetable =
                direction.weekdays;
        }

        if (!timetable) {
            return trips;
        }


        // -----------------------------------------------------
        // HODINY
        // -----------------------------------------------------

        for (
            const hourKey of Object.keys(timetable)
        ) {

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
            // ODJEZDY
            // -------------------------------------------------

            for (
                const departureValue of departures
            ) {

                const parsed =
                    parseDeparture(
                        departureValue
                    );

                if (!parsed) {
                    continue;
                }


                const startTime =
                    hour * 60 +
                    parsed.minute;


                let stopCount =
                    direction.stops.length;

                let destination =
                    direction.destination || "";


                // -------------------------------------------------
                // ZKRÁCENÝ SPOJ
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

                    const name =
                        direction.stops[i];

                    const travelTime =
                        Number(
                            direction.travelTimes[i]
                        );

                    if (
                        !name ||
                        !Number.isFinite(
                            travelTime
                        )
                    ) {
                        continue;
                    }

                    const absoluteMinutes =
                        startTime +
                        travelTime;

                    stops.push({

                        name,

                        time:
                            minutesToTime(
                                absoluteMinutes
                            ),

                        minutes:
                            absoluteMinutes,

                        index:
                            i
                    });
                }


                if (stops.length < 2) {
                    continue;
                }


                // -------------------------------------------------
                // UNIKÁTNÍ ID JÍZDY
                // -------------------------------------------------

                const tripId =
                    [
                        String(line),
                        String(
                            direction.id ?? destination
                        ),
                        startTime,
                        parsed.isShortTrip
                            ? "S"
                            : "N"
                    ].join("|");


                trips.push({

                    id:
                        tripId,

                    line:
                        String(line),

                    directionId:
                        direction.id ?? "",

                    destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops
                });
            }
        }

        return trips;
    }


    // =========================================================
    // VŠECHNY JÍZDY LINKY
    // =========================================================

    async function getTrips(
        line,
        dayType
    ) {

        const timetable =
            await loadTimetable(line);

        const trips = [];

        if (
            !timetable ||
            !Array.isArray(
                timetable.directions
            )
        ) {
            return trips;
        }

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


    // =========================================================
    // VŠECHNY LINKY
    // =========================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        if (!Array.isArray(lineNumbers)) {
            return [];
        }

        const results =
            await Promise.all(
                lineNumbers.map(
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


        const allTrips = [];

        for (
            const trips
            of results
        ) {

            allTrips.push(
                ...trips
            );
        }


        console.log(
            "NAČTENÉ JÍZDY:",
            allTrips.length
        );


        return allTrips;
    }


    // =========================================================
    // NAJDI ZASTÁVKU V JÍZDĚ
    // =========================================================

    function findStopIndex(
        trip,
        stopName,
        startIndex = 0
    ) {

        const wanted =
            normalizeStop(
                stopName
            );

        for (
            let i = startIndex;
            i < trip.stops.length;
            i++
        ) {

            if (
                normalizeStop(
                    trip.stops[i].name
                ) === wanted
            ) {
                return i;
            }
        }

        return -1;
    }


    // =========================================================
    // SEGMENT
    // =========================================================

    function getSegment(
        trip,
        from,
        to,
        startIndex = 0
    ) {

        const fromIndex =
            findStopIndex(
                trip,
                from,
                startIndex
            );

        if (fromIndex === -1) {
            return null;
        }


        const toIndex =
            findStopIndex(
                trip,
                to,
                fromIndex + 1
            );

        if (toIndex === -1) {
            return null;
        }


        const departureStop =
            trip.stops[fromIndex];

        const arrivalStop =
            trip.stops[toIndex];


        return {

            fromIndex,

            toIndex,

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


    // =========================================================
    // PŘÍMÉ SPOJE
    // =========================================================

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
                    segment.stops,

                tripId:
                    trip.id
            });
        }


        return results;
    }


    // =========================================================
    // INDEX ZASTÁVEK
    // =========================================================

    function buildStopIndex(
        allTrips
    ) {

        const index =
            new Map();


        for (
            const trip
            of allTrips
        ) {

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

                    index: i
                });
            }
        }


        return index;
    }


    // =========================================================
    // VYTVOŘENÍ LEGU
    // =========================================================

    function createLeg(
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
                segment.stops,

            tripId:
                trip.id
        };
    }


    // =========================================================
    // SKÓRE SPOJE
    // =========================================================

    function journeyScore(
        journey
    ) {

        if (
            !journey ||
            !journey.legs ||
            journey.legs.length === 0
        ) {
            return Infinity;
        }


        const first =
            journey.legs[0];

        const last =
            journey.legs[
                journey.legs.length - 1
            ];


        const transfers =
            journey.legs.length - 1;


        const totalTravel =
            last.arrivalMinutes -
            first.departureMinutes;


        const waiting =
            Number(
                journey.totalWaiting || 0
            );


        /*
         * Hlavní priorita:
         *
         * 1. co nejdřívější příjezd
         * 2. méně přestupů
         * 3. kratší čekání
         * 4. kratší celková cesta
         */

        return (
            last.arrivalMinutes * 1000000 +
            transfers * 10000 +
            waiting * 10 +
            totalTravel
        );
    }


    // =========================================================
    // PŘESTUPNÍ SPOJE
    // =========================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime
    ) {

        const results = [];

        if (!allTrips.length) {
            return results;
        }


        const stopIndex =
            buildStopIndex(
                allTrips
            );


        const starting =
            stopIndex.get(
                normalizeStop(from)
            ) || [];


        if (!starting.length) {
            return results;
        }


        const queue = [];


        // =====================================================
        // START
        // =====================================================

        for (
            const occurrence
            of starting
        ) {

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


            queue.push({

                trip,

                index,

                from,

                legs: [],

                transfers: 0,

                totalWaiting: 0,

                visitedTrips:
                    new Set([
                        trip.id
                    ])
            });
        }


        let states = 0;


        // =====================================================
        // BFS
        // =====================================================

        while (
            queue.length > 0 &&
            states < MAX_STATES
        ) {

            const state =
                queue.shift();

            states++;


            const trip =
                state.trip;


            const startIndex =
                state.index;


            const startStop =
                trip.stops[
                    startIndex
                ];


            if (!startStop) {
                continue;
            }


            // -------------------------------------------------
            // PROJDEME VŠECHNY DALŠÍ ZASTÁVKY
            // -------------------------------------------------

            for (
                let transferIndex =
                    startIndex + 1;

                transferIndex <
                trip.stops.length;

                transferIndex++
            ) {

                const transferStop =
                    trip.stops[
                        transferIndex
                    ];


                const transferName =
                    transferStop.name;


                const arrivalAtTransfer =
                    transferStop.minutes;


                const possibleTrips =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                // -------------------------------------------------
                // HLEDÁME DALŠÍ SPOJ
                // -------------------------------------------------

                for (
                    const occurrence
                    of possibleTrips
                ) {

                    const nextTrip =
                        occurrence.trip;

                    const nextIndex =
                        occurrence.index;


                    if (
                        state.visitedTrips.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    const nextStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    if (!nextStop) {
                        continue;
                    }


                    const nextDeparture =
                        nextStop.minutes;


                    // -------------------------------------------------
                    // ČAS NA PŘESTUP
                    // -------------------------------------------------

                    if (
                        nextDeparture <
                        arrivalAtTransfer +
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    // -------------------------------------------------
                    // ÚSEK NOVOU LINKOU DO CÍLE
                    // -------------------------------------------------

                    const finalSegment =
                        getSegment(
                            nextTrip,
                            transferName,
                            to,
                            nextIndex
                        );


                    // -------------------------------------------------
                    // AKTUÁLNÍ LEG
                    // -------------------------------------------------

                    const currentSegment = {

                        fromIndex:
                            startIndex,

                        toIndex:
                            transferIndex,

                        stops:
                            trip.stops.slice(
                                startIndex,
                                transferIndex + 1
                            ),

                        departure:
                            trip.stops[
                                startIndex
                            ].time,

                        departureMinutes:
                            trip.stops[
                                startIndex
                            ].minutes,

                        arrival:
                            transferStop.time,

                        arrivalMinutes:
                            arrivalAtTransfer
                    };


                    const currentLeg =
                        createLeg(
                            trip,
                            currentSegment,
                            state.from,
                            transferName
                        );


                    const legs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // =================================================
                    // CÍL
                    // =================================================

                    if (finalSegment) {

                        const finalLeg =
                            createLeg(
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


                        // !!! DŮLEŽITÉ !!!
                        // waiting je vytvořeno PŘED použitím.

                        const waiting =
                            nextDeparture -
                            arrivalAtTransfer;


                        const journey = {

                            type:
                                "transfer",

                            legs:
                                complete,

                            transfers:
                                complete.length - 1,

                            departure:
                                complete[0]
                                    .departure,

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
                                waiting,

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


                    // =================================================
                    // DALŠÍ PŘESTUP
                    // =================================================

                    if (
                        state.transfers >=
                        MAX_TRANSFERS - 1
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


                    const waiting =
                        nextDeparture -
                        arrivalAtTransfer;


                    queue.push({

                        trip:
                            nextTrip,

                        index:
                            nextIndex,

                        from:
                            transferName,

                        legs,

                        transfers:
                            state.transfers + 1,

                        totalWaiting:
                            state.totalWaiting +
                            waiting,

                        visitedTrips:
                            visited
                    });
                }
            }
        }


        console.log(
            "PROZKOUMANÝCH STAVŮ:",
            states
        );


        return results;
    }


    // =========================================================
    // ODSTRANĚNÍ DUPLICIT
    // =========================================================

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

            let key;


            if (
                connection.type ===
                "transfer"
            ) {

                key =
                    connection.legs
                        .map(
                            leg =>
                                leg.tripId +
                                "|" +
                                leg.from +
                                "|" +
                                leg.to
                        )
                        .join(">>");

            } else {

                key =
                    [
                        connection.tripId,
                        connection.from,
                        connection.to
                    ].join("|");
            }


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


    // =========================================================
    // HLAVNÍ VYHLEDÁVÁNÍ
    // =========================================================

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
            !to ||
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {
            return [];
        }


        if (
            normalizeStop(from) ===
            normalizeStop(to)
        ) {
            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        // =====================================================
        // NAČTENÍ VŠECH JÍZD
        // =====================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        if (!allTrips.length) {

            console.warn(
                "Nebyly načteny žádné spoje."
            );

            return [];
        }


        // =====================================================
        // PŘÍMÉ SPOJE
        // =====================================================

        let direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        // =====================================================
        // PŘESTUPY
        // =====================================================

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


        // =====================================================
        // SPOJENÍ
        // =====================================================

        let connections =
            [
                ...direct,
                ...transfers
            ];


        // =====================================================
        // DUPLICITY
        // =====================================================

        connections =
            removeDuplicates(
                connections
            );


        // =====================================================
        // SEŘAZENÍ
        // =====================================================

        if (
            mode === "departure"
        ) {

            connections.sort(
                (a, b) => {

                    const aScore =
                        journeyScore(
                            a.type === "transfer"
                                ? a
                                : {
                                    legs: [
                                        {
                                            departureMinutes:
                                                a.departureMinutes,

                                            arrivalMinutes:
                                                a.arrivalMinutes
                                        }
                                    ],

                                    totalWaiting: 0
                                }
                        );


                    const bScore =
                        journeyScore(
                            b.type === "transfer"
                                ? b
                                : {
                                    legs: [
                                        {
                                            departureMinutes:
                                                b.departureMinutes,

                                            arrivalMinutes:
                                                b.arrivalMinutes
                                        }
                                    ],

                                    totalWaiting: 0
                                }
                        );


                    return (
                        aScore -
                        bScore
                    );
                }
            );

        } else {

            connections.sort(
                (a, b) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        // =====================================================
        // VÝSLEDKY
        // =====================================================

        const finalResults =
            connections.slice(
                0,
                MAX_RESULTS
            );


        console.log(
            "NALEZENÉ SPOJE:",
            finalResults
        );


        return finalResults;
    }


    // =========================================================
    // EXPORT
    // =========================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections

    };

})();

           
