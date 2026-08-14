// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    const MAX_TRANSFERS = 4;
    const MAX_RESULTS = 20;
    const MIN_TRANSFER_TIME = 2;

    // Kolik nejbližších odjezdů z každé zastávky zkoušet
    const MAX_NEXT_TRIPS = 12;


    // =========================================================
    // NORMALIZACE ZASTÁVKY
    // =========================================================

    function normalizeStop(name) {
        return String(name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =========================================================
    // ČAS
    // =========================================================

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


    // =========================================================
    // ODJEZD Z JÍZDNÍHO ŘÁDU
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

        const response =
            await fetch(
                `data/timetables/${encodeURIComponent(line)}.json`
            );

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
    // VYTVOŘENÍ JÍZD
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


        let timetable =
            direction[dayType];

        if (
            !timetable &&
            dayType === "weekday"
        ) {
            timetable =
                direction.weekdays;
        }

        if (
            !timetable &&
            dayType === "weekend"
        ) {
            timetable =
                direction.weekends;
        }

        if (!timetable) {
            return trips;
        }


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


                // ---------------------------------------------
                // ZKRÁCENÝ SPOJ S
                // ---------------------------------------------

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

                    const name =
                        direction.stops[i];

                    const travelTime =
                        Number(
                            direction.travelTimes[i]
                        );

                    if (
                        !name ||
                        !Number.isFinite(travelTime)
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


                // Každá konkrétní jízda má vlastní ID
                const id =
                    [
                        String(line),
                        String(
                            direction.id ??
                            destination
                        ),
                        startTime,
                        parsed.isShortTrip
                            ? "S"
                            : "N"
                    ].join("|");


                trips.push({

                    id,

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
    // JÍZDY LINKY
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
    // VŠECHNY JÍZDY
    // =========================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

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


        const allTrips =
            results.flat();


        console.log(
            "NAČTENO JÍZD:",
            allTrips.length
        );


        return allTrips;
    }


    // =========================================================
    // NAJDI ÚSEK
    // =========================================================

    function getSegment(
        trip,
        from,
        to,
        startIndex = 0
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


        let fromIndex = -1;


        for (
            let i = startIndex;
            i < trip.stops.length;
            i++
        ) {

            if (
                normalizeStop(
                    trip.stops[i].name
                ) === fromKey
            ) {

                fromIndex =
                    i;

                break;
            }
        }


        if (fromIndex === -1) {
            return null;
        }


        let toIndex = -1;


        for (
            let i = fromIndex + 1;
            i < trip.stops.length;
            i++
        ) {

            if (
                normalizeStop(
                    trip.stops[i].name
                ) === toKey
            ) {

                toIndex =
                    i;

                break;
            }
        }


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

            departure:
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes,

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                )
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

                tripId:
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


    // =========================================================
    // INDEX ZASTÁVEK
    // =========================================================

    function buildStopIndex(
        trips
    ) {

        const index =
            new Map();


        for (
            const trip of trips
        ) {

            for (
                let i = 0;
                i < trip.stops.length;
                i++
            ) {

                const key =
                    normalizeStop(
                        trip.stops[i].name
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


    // =========================================================
    // VYTVOŘENÍ LEGU
    // =========================================================

    function makeLeg(
        trip,
        segment,
        from,
        to
    ) {

        return {

            tripId:
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
        };
    }


    // =========================================================
    // PŘESTUPNÍ SPOJE
    //
    // DŮLEŽITÉ:
    // Pro každý stav hledáme pouze několik nejbližších
    // použitelných spojů. Tím se vyhneme zaseknutí.
    // =========================================================

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


        const startOccurrences =
            stopIndex.get(
                startKey
            ) || [];


        if (
            startOccurrences.length === 0
        ) {
            return [];
        }


        const queue = [];


        // -----------------------------------------------------
        // STARTOVNÍ JÍZDY
        // -----------------------------------------------------

        for (
            const occurrence
            of startOccurrences
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

                visited:
                    new Set([
                        trip.id
                    ])
            });
        }


        // -----------------------------------------------------
        // ŘAZENÍ STARTŮ
        // -----------------------------------------------------

        queue.sort(
            (a, b) =>
                a.trip.stops[a.index].minutes -
                b.trip.stops[b.index].minutes
        );


        // -----------------------------------------------------
        // OMEZENÍ POČÁTEČNÍCH JÍZD
        // -----------------------------------------------------

        const limitedQueue =
            queue.slice(
                0,
                MAX_RESULTS * 3
            );


        let position = 0;


        while (
            position <
            limitedQueue.length
        ) {

            const state =
                limitedQueue[position++];

            const trip =
                state.trip;

            const startIndex =
                state.index;


            // -------------------------------------------------
            // KAŽDÁ DALŠÍ ZASTÁVKA
            // -------------------------------------------------

            for (
                let i = startIndex + 1;
                i < trip.stops.length;
                i++
            ) {

                const transferStop =
                    trip.stops[i];


                const transferName =
                    transferStop.name;


                const arrivalTime =
                    transferStop.minutes;


                // -------------------------------------------------
                // JÍZDY Z TÉTO ZASTÁVKY
                // -------------------------------------------------

                const occurrences =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                const candidates = [];


                for (
                    const occurrence
                    of occurrences
                ) {

                    const nextTrip =
                        occurrence.trip;

                    const nextIndex =
                        occurrence.index;


                    if (
                        state.visited.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    const departureStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    if (!departureStop) {
                        continue;
                    }


                    const departureTime =
                        departureStop.minutes;


                    if (
                        departureTime <
                        arrivalTime +
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    candidates.push({

                        trip:
                            nextTrip,

                        index:
                            nextIndex,

                        departure:
                            departureTime
                    });
                }


                // -------------------------------------------------
                // NEJBLIŽŠÍ ODJEZDY
                // -------------------------------------------------

                candidates.sort(
                    (a, b) =>
                        a.departure -
                        b.departure
                );


                const selected =
                    candidates.slice(
                        0,
                        MAX_NEXT_TRIPS
                    );


                // -------------------------------------------------
                // KAŽDÝ VYBRANÝ PŘESTUP
                // -------------------------------------------------

                for (
                    const candidate
                    of selected
                ) {

                    const nextTrip =
                        candidate.trip;

                    const nextIndex =
                        candidate.index;


                    const waiting =
                        candidate.departure -
                        arrivalTime;


                    // -------------------------------------------------
                    // AKTUÁLNÍ LEG
                    // -------------------------------------------------

                    const currentSegment = {

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
                            arrivalTime,

                        stops:
                            trip.stops.slice(
                                startIndex,
                                i + 1
                            )
                    };


                    const currentLeg =
                        makeLeg(
                            trip,
                            currentSegment,
                            state.from,
                            transferName
                        );


                    const newLegs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // -------------------------------------------------
                    // ZKUSÍME JET ZDE ROVNOU DO CÍLE
                    // -------------------------------------------------

                    const finalSegment =
                        getSegment(
                            nextTrip,
                            transferName,
                            to,
                            nextIndex
                        );


                    if (finalSegment) {

                        const finalLeg =
                            makeLeg(
                                nextTrip,
                                finalSegment,
                                transferName,
                                to
                            );


                        const legs =
                            [
                                ...newLegs,
                                finalLeg
                            ];


                        const journey = {

                            type:
                                "transfer",

                            legs,

                            transfers:
                                legs.length - 1,

                            departure:
                                legs[0]
                                    .departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                legs[0]
                                    .departureMinutes,

                            arrivalMinutes:
                                finalLeg
                                    .arrivalMinutes,

                            totalWaiting:
                                state.totalWaiting +
                                waiting,

                            transferStops:
                                legs
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
                    // DALŠÍ PŘESTUP
                    // -------------------------------------------------

                    if (
                        state.transfers >=
                        MAX_TRANSFERS
                    ) {
                        continue;
                    }


                    const visited =
                        new Set(
                            state.visited
                        );


                    visited.add(
                        nextTrip.id
                    );


                    limitedQueue.push({

                        trip:
                            nextTrip,

                        index:
                            nextIndex,

                        from:
                            transferName,

                        legs:
                            newLegs,

                        transfers:
                            state.transfers + 1,

                        totalWaiting:
                            state.totalWaiting +
                            waiting,

                        visited
                    });
                }
            }
        }


        return results;
    }


    // =========================================================
    // DUPLICITY
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
                                leg.tripId
                        )
                        .join(">>");

            } else {

                key =
                    connection.tripId;
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
    // SKÓRE
    // =========================================================

    function scoreConnection(
        connection
    ) {

        const legs =
            connection.type === "transfer"
                ? connection.legs
                : [{
                    departureMinutes:
                        connection.departureMinutes,

                    arrivalMinutes:
                        connection.arrivalMinutes
                }];


        const first =
            legs[0];

        const last =
            legs[legs.length - 1];


        const transfers =
            legs.length - 1;


        const travelTime =
            last.arrivalMinutes -
            first.departureMinutes;


        const waiting =
            connection.totalWaiting || 0;


        /*
         * Nejdříve chceme rychlé spojení.
         * Přestup je penalizován, ale pouze mírně.
         */

        return (
            last.arrivalMinutes * 100000 +
            transfers * 1000 +
            waiting * 5 +
            travelTime
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

        console.log(
            "START SEARCH:",
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


        // =====================================================
        // NAČTENÍ
        // =====================================================

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "SEARCH: všechny jízdy načteny:",
            allTrips.length
        );


        if (
            allTrips.length === 0
        ) {
            return [];
        }


        // =====================================================
        // PŘÍMÉ
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

        connections.sort(
            (a, b) =>
                scoreConnection(a) -
                scoreConnection(b)
        );


        // =====================================================
        // VÝSLEDKY
        // =====================================================

        const results =
            connections.slice(
                0,
                MAX_RESULTS
            );


        console.log(
            "SEARCH HOTOVO:",
            results
        );


        return results;
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
           
