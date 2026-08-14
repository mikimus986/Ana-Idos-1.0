// search.js

window.searchTimetable = (() => {

    // =====================================================
    // CACHE
    // =====================================================

    const timetableCache = new Map();

    // Maximálně 4 PŘESTUPY
    // => maximálně 5 různých spojů
    const MAX_TRANSFERS = 4;
    const MAX_LEGS = MAX_TRANSFERS + 1;

    // Minimální čas na přestup
    const MIN_TRANSFER_TIME = 2;

    // Ochrana proti nekonečnému hledání
    const MAX_STATES = 10000;

    // Kolik výsledků vrátit aplikaci
    const MAX_RESULTS = 30;


    // =====================================================
    // NORMALIZACE
    // =====================================================

    function normalizeStop(value) {

        return String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

    async function loadTimetable(line) {

        line = String(line ?? "").trim();

        if (!line) {
            throw new Error("Chybí číslo linky.");
        }

        if (timetableCache.has(line)) {
            return timetableCache.get(line);
        }

        const url =
            `data/timetables/${encodeURIComponent(line)}.json`;

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                `Nelze načíst jízdní řád linky ${line}: HTTP ${response.status}`
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

        timetableCache.set(
            line,
            data
        );

        return data;
    }


    // =====================================================
    // ČAS
    // =====================================================

    function timeToMinutes(value) {

        const text =
            String(value ?? "").trim();

        const match =
            text.match(/^(\d{1,3}):(\d{2})$/);

        if (!match) {
            return NaN;
        }

        const hour =
            Number(match[1]);

        const minute =
            Number(match[2]);

        if (
            !Number.isFinite(hour) ||
            !Number.isFinite(minute) ||
            minute < 0 ||
            minute > 59
        ) {
            return NaN;
        }

        return hour * 60 + minute;
    }


    function minutesToTime(minutes) {

        let value =
            Number(minutes);

        if (!Number.isFinite(value)) {
            return "--:--";
        }

        value =
            ((value % 1440) + 1440) % 1440;

        const hour =
            Math.floor(value / 60);

        const minute =
            value % 60;

        return (
            String(hour).padStart(2, "0") +
            ":" +
            String(minute).padStart(2, "0")
        );
    }


    // =====================================================
    // ODJEZD Z JÍZDNÍHO ŘÁDU
    //
    // Podporuje:
    // 25
    // 45
    // 45S
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
    // NAJDE DATA PRO DAN
    // =====================================================

    function getDayTable(
        direction,
        dayType
    ) {

        if (!direction) {
            return null;
        }

        // app.js používá weekdays / weekends
        if (
            dayType === "weekdays" &&
            direction.weekdays
        ) {
            return direction.weekdays;
        }

        if (
            dayType === "weekends" &&
            direction.weekends
        ) {
            return direction.weekends;
        }

        // Záloha pro případ staršího pojmenování
        if (
            dayType === "weekday" &&
            direction.weekday
        ) {
            return direction.weekday;
        }

        if (
            dayType === "weekend" &&
            direction.weekend
        ) {
            return direction.weekend;
        }

        // Obecná záloha
        if (direction[dayType]) {
            return direction[dayType];
        }

        return null;
    }


    // =====================================================
    // VYTVOŘENÍ VŠECH SPOJŮ JEDNOHO SMĚRU
    // =====================================================

    function createTrips(
        line,
        direction,
        directionIndex,
        dayType
    ) {

        const trips = [];

        if (
            !direction ||
            typeof direction !== "object"
        ) {
            return trips;
        }

        if (
            !Array.isArray(direction.stops)
        ) {
            return trips;
        }

        if (
            !Array.isArray(direction.travelTimes)
        ) {
            return trips;
        }

        const timetable =
            getDayTable(
                direction,
                dayType
            );

        if (!timetable) {
            return trips;
        }


        // -------------------------------------------------
        // ZASTÁVKY
        // -------------------------------------------------

        const stopNames =
            direction.stops;


        // -------------------------------------------------
        // VYTVOŘENÍ SPOJŮ
        // -------------------------------------------------

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
                let departureIndex = 0;
                departureIndex < departures.length;
                departureIndex++
            ) {

                const parsed =
                    parseDeparture(
                        departures[departureIndex]
                    );

                if (!parsed) {
                    continue;
                }


                const firstTime =
                    hour * 60 +
                    parsed.minute;


                // -------------------------------------------------
                // URČENÍ KONCE SPOJE
                // -------------------------------------------------

                let stopCount =
                    stopNames.length;

                let destination =
                    String(
                        direction.destination ?? ""
                    );


                // -------------------------------------------------
                // ZKRÁCENÝ SPOJ S
                // -------------------------------------------------

                if (parsed.isShortTrip) {

                    const shortStopIndex =
                        stopNames.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                normalizeStop(
                                    "Sminov, u lávky"
                                )
                        );

                    if (
                        shortStopIndex !== -1
                    ) {

                        stopCount =
                            shortStopIndex + 1;

                        destination =
                            stopNames[
                                shortStopIndex
                            ];
                    }
                }


                // -------------------------------------------------
                // ZASTÁVKY
                // -------------------------------------------------

                const stops = [];


                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const stopName =
                        stopNames[i];

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
                            absoluteTime,

                        index:
                            i
                    });
                }


                if (
                    stops.length < 2
                ) {
                    continue;
                }


                // -------------------------------------------------
                // JEDINEČNÉ ID SPOJE
                // -------------------------------------------------

                const tripId = [

                    String(line),

                    `direction-${directionIndex}`,

                    firstTime,

                    parsed.isShortTrip
                        ? "S"
                        : "N",

                    departureIndex

                ].join("-");


                trips.push({

                    id:
                        tripId,

                    line:
                        String(line),

                    directionId:
                        direction.id ??
                        `direction-${directionIndex}`,

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
    // VŠECHNY SPOJE LINKY
    // =====================================================

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
            let i = 0;
            i < timetable.directions.length;
            i++
        ) {

            const direction =
                timetable.directions[i];

            trips.push(
                ...createTrips(
                    line,
                    direction,
                    i,
                    dayType
                )
            );
        }


        return trips;
    }


    // =====================================================
    // NAČTENÍ VŠECH LINEK
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        if (
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {
            return [];
        }


        // Odstranění duplicitních čísel linek
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


        const allTrips = [];


        for (
            const trips of results
        ) {

            if (
                Array.isArray(trips)
            ) {

                allTrips.push(
                    ...trips
                );
            }
        }


        console.log(
            "Načtené spoje:",
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

        if (
            !trip ||
            !Array.isArray(
                trip.stops
            )
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
                    normalizeStop(
                        stop.name
                    ) === fromKey
            );


        if (
            fromIndex === -1
        ) {
            return null;
        }


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    normalizeStop(
                        stop.name
                    ) === toKey
            );


        if (
            toIndex === -1
        ) {
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
                arrivalStop.minutes,

            fromIndex:
                fromIndex,

            toIndex:
                toIndex
        };
    }


    // =====================================================
    // ÚSEK OD KONKRÉTNÍ ZASTÁVKY
    // =====================================================

    function getSegmentFromIndex(
        trip,
        fromIndex,
        to
    ) {

        if (
            !trip ||
            !Array.isArray(
                trip.stops
            )
        ) {
            return null;
        }


        if (
            fromIndex < 0 ||
            fromIndex >= trip.stops.length
        ) {
            return null;
        }


        const toKey =
            normalizeStop(to);


        const toIndex =
            trip.stops.findIndex(
                (stop, index) =>
                    index > fromIndex &&
                    normalizeStop(
                        stop.name
                    ) === toKey
            );


        if (
            toIndex === -1
        ) {
            return null;
        }


        const departureStop =
            trip.stops[fromIndex];

        const arrivalStop =
            trip.stops[toIndex];


        if (
            !departureStop ||
            !arrivalStop
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
                departureStop.time,

            departureMinutes:
                departureStop.minutes,

            arrival:
                arrivalStop.time,

            arrivalMinutes:
                arrivalStop.minutes,

            fromIndex:
                fromIndex,

            toIndex:
                toIndex
        };
    }


    // =====================================================
    // VYTVOŘENÍ LEGU
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
    // INDEX ZASTÁVEK
    // =====================================================

    function buildStopIndex(
        trips
    ) {

        const index =
            new Map();


        for (
            const trip of trips
        ) {

            if (
                !trip ||
                !Array.isArray(
                    trip.stops
                )
            ) {
                continue;
            }


            for (
                let i = 0;
                i < trip.stops.length;
                i++
            ) {

                const stop =
                    trip.stops[i];

                if (
                    !stop ||
                    !stop.name
                ) {
                    continue;
                }


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

                    trip:
                        trip,

                    index:
                        i
                });
            }
        }


        return index;
    }


    // =====================================================
    // VYTVOŘENÍ JEDINEČNÉHO KLÍČE CESTY
    // =====================================================

    function journeyKey(
        journey
    ) {

        if (
            !journey ||
            !Array.isArray(
                journey.legs
            )
        ) {
            return "";
        }


        return journey.legs
            .map(
                leg =>
                    [
                        leg.line,
                        leg.directionId,
                        leg.departure,
                        leg.arrival,
                        normalizeStop(leg.from),
                        normalizeStop(leg.to)
                    ].join(":")
            )
            .join("|");
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICIT
    // =====================================================

    function removeDuplicateJourneys(
        journeys
    ) {

        const seen =
            new Set();

        const result = [];


        for (
            const journey of journeys
        ) {

            const key =
                journeyKey(
                    journey
                );


            if (!key) {
                continue;
            }


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            result.push(
                journey
            );
        }


        return result;
    }


    // =====================================================
    // SKÓRE SPOJE
    //
    // Nejprve je důležitý čas příjezdu.
    // Potom počet přestupů.
    // Potom čekání.
    // =====================================================

    function getJourneyScore(
        journey
    ) {

        if (
            !journey ||
            !Array.isArray(
                journey.legs
            ) ||
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


        const totalWaiting =
            Number(
                journey.totalWaiting
            ) || 0;


        const totalTravel =
            last.arrivalMinutes -
            first.departureMinutes;


        /*
         * Hlavní priorita:
         * nejdřívější příjezd.
         *
         * Potom:
         * méně přestupů.
         *
         * Potom:
         * méně čekání.
         *
         * Potom:
         * kratší cesta.
         */

        return (

            last.arrivalMinutes * 1000000 +

            transfers * 10000 +

            totalWaiting * 10 +

            totalTravel
        );
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


        if (
            !Array.isArray(allTrips) ||
            allTrips.length === 0
        ) {
            return results;
        }


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
            return results;
        }


        const queue = [];


        // =================================================
        // START
        // =================================================

        for (
            const occurrence
            of startOccurrences
        ) {

            const trip =
                occurrence.trip;

            const stopIndexInTrip =
                occurrence.index;


            const stop =
                trip.stops[
                    stopIndexInTrip
                ];


            if (!stop) {
                continue;
            }


            if (
                stop.minutes <
                wantedTime
            ) {
                continue;
            }


            // Pokud tento spoj jede rovnou do cíle,
            // řeší ho findDirectConnections.
            const direct =
                getSegmentFromIndex(
                    trip,
                    stopIndexInTrip,
                    to
                );


            if (direct) {
                continue;
            }


            queue.push({

                trip:
                    trip,

                stop:
                    stop.name,

                stopIndex:
                    stopIndexInTrip,

                legs:
                    [],

                departureMinutes:
                    stop.minutes,

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


        let processedStates = 0;


        // =================================================
        // PROHLEDÁVÁNÍ
        // =================================================

        while (
            queue.length > 0 &&
            processedStates < MAX_STATES
        ) {

            const state =
                queue.shift();


            processedStates++;


            if (
                !state ||
                !state.trip ||
                !Array.isArray(
                    state.trip.stops
                )
            ) {
                continue;
            }


            const currentTrip =
                state.trip;


            const currentIndex =
                state.stopIndex;


            // ---------------------------------------------
            // PROCHÁZÍME DALŠÍ ZASTÁVKY
            // ---------------------------------------------

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


                if (!transferStop) {
                    continue;
                }


                const transferName =
                    transferStop.name;


                const arrivalAtTransfer =
                    transferStop.minutes;


                // ---------------------------------------------
                // NAJDEME VŠECHNY SPOJE V TÉTO ZASTÁVCE
                // ---------------------------------------------

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
                        !nextTrip
                    ) {
                        continue;
                    }


                    // Stejný spoj nemá smysl
                    if (
                        nextTrip.id ===
                        currentTrip.id
                    ) {
                        continue;
                    }


                    // Cyklus
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


                    // ---------------------------------------------
                    // ČAS NA PŘESTUP
                    // ---------------------------------------------

                    const waiting =
                        nextDeparture -
                        arrivalAtTransfer;


                    if (
                        waiting <
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    // ---------------------------------------------
                    // NOVÝ LEG
                    // ---------------------------------------------

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
                            arrivalAtTransfer
                    };


                    const currentLeg =
                        makeLeg(
                            currentTrip,
                            currentSegment,
                            state.stop,
                            transferName
                        );


                    const newLegs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // ---------------------------------------------
                    // ZKONTROLUJEME CÍL
                    // ---------------------------------------------

                    const finalSegment =
                        getSegmentFromIndex(
                            nextTrip,
                            nextIndex,
                            to
                        );


                    if (
                        finalSegment
                    ) {

                        const finalLeg =
                            makeLeg(
                                nextTrip,
                                finalSegment,
                                transferName,
                                to
                            );


                        const completeLegs =
                            [
                                ...newLegs,
                                finalLeg
                            ];


                        const journey = {

                            type:
                                "transfer",

                            legs:
                                completeLegs,

                            transfers:
                                completeLegs.length - 1,

                            departure:
                                completeLegs[0]
                                    .departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                completeLegs[0]
                                    .departureMinutes,

                            arrivalMinutes:
                                finalLeg
                                    .arrivalMinutes,

                            totalWaiting:
                                (
                                    Number(
                                        state.totalWaiting
                                    ) || 0
                                ) + waiting,

                            transferStops:
                                completeLegs
                                    .slice(0, -1)
                                    .map(
                                        leg =>
                                            leg.to
                                    )
                        };


                        results.push(
                            journey
                        );


                        // Tento konkrétní přestup jsme našli.
                        // Není potřeba pokračovat z něj
                        // do dalších přestupů, pokud by
                        // už byl horší.
                        continue;
                    }


                    // ---------------------------------------------
                    // MAXIMÁLNĚ 4 PŘESTUPY
                    // ---------------------------------------------

                    const newTransfers =
                        state.transfers + 1;


                    if (
                        newTransfers >=
                        MAX_TRANSFERS
                    ) {
                        continue;
                    }


                    const visitedTrips =
                        new Set(
                            state.visitedTrips
                        );


                    visitedTrips.add(
                        nextTrip.id
                    );


                    queue.push({

                        trip:
                            nextTrip,

                        stop:
                            transferName,

                        stopIndex:
                            nextIndex,

                        legs:
                            newLegs,

                        departureMinutes:
                            state.departureMinutes,

                        totalWaiting:
                            (
                                Number(
                                    state.totalWaiting
                                ) || 0
                            ) + waiting,

                        transfers:
                            newTransfers,

                        visitedTrips:
                            visitedTrips
                    });
                }
            }
        }


        console.log(
            "Prozkoumaných stavů:",
            processedStates
        );


        return removeDuplicateJourneys(
            results
        );
    }


    // =====================================================
    // VÝBĚR NEJLEPŠÍCH VÝSLEDKŮ
    // =====================================================

    function selectBestConnections(
        direct,
        transfers,
        mode
    ) {

        const all = [
            ...direct,
            ...transfers
        ];


        if (all.length === 0) {
            return [];
        }


        const unique =
            [];


        const seen =
            new Set();


        // ---------------------------------------------
        // DEDUPLICITA
        // ---------------------------------------------

        for (
            const connection of all
        ) {

            let key = "";


            if (
                connection.type ===
                "transfer"
            ) {

                key =
                    journeyKey(
                        connection
                    );

            } else {

                key = [

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


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            unique.push(
                connection
            );
        }


        // ---------------------------------------------
        // ODJEZD
        // ---------------------------------------------

        if (
            mode === "departure"
        ) {

            unique.sort(
                (a, b) => {

                    const aDeparture =
                        Number(
                            a.departureMinutes
                        );

                    const bDeparture =
                        Number(
                            b.departureMinutes
                        );


                    if (
                        aDeparture !==
                        bDeparture
                    ) {

                        return (
                            aDeparture -
                            bDeparture
                        );
                    }


                    const aArrival =
                        Number(
                            a.arrivalMinutes
                        );

                    const bArrival =
                        Number(
                            b.arrivalMinutes
                        );


                    if (
                        aArrival !==
                        bArrival
                    ) {

                        return (
                            aArrival -
                            bArrival
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


                    return (
                        aTransfers -
                        bTransfers
                    );
                }
            );

        } else {

            // ---------------------------------------------
            // PŘÍJEZD
            // ---------------------------------------------

            unique.sort(
                (a, b) => {

                    const aArrival =
                        Number(
                            a.arrivalMinutes
                        );

                    const bArrival =
                        Number(
                            b.arrivalMinutes
                        );


                    if (
                        aArrival !==
                        bArrival
                    ) {

                        return (
                            aArrival -
                            bArrival
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


                    return (
                        aTransfers -
                        bTransfers
                    );
                }
            );
        }


        // ---------------------------------------------
        // NEJLEPŠÍ SPOJE
        // ---------------------------------------------

        return unique.slice(
            0,
            MAX_RESULTS
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
            "================================="
        );

        console.log(
            "VYHLEDÁVÁNÍ:",
            from,
            "→",
            to
        );

        console.log(
            "ČAS:",
            afterTime
        );

        console.log(
            "DEN:",
            dayType
        );

        console.log(
            "LINKY:",
            lineNumbers
        );


        // ---------------------------------------------
        // KONTROLA
        // ---------------------------------------------

        if (
            !from ||
            !to
        ) {
            return [];
        }


        if (
            normalizeStop(from) ===
            normalizeStop(to)
        ) {
            return [];
        }


        if (
            !Array.isArray(
                lineNumbers
            ) ||
            lineNumbers.length === 0
        ) {
            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        if (
            !Number.isFinite(
                wantedTime
            )
        ) {

            throw new Error(
                `Neplatný čas: ${afterTime}`
            );
        }


        // ---------------------------------------------
        // NAČTENÍ VŠECH LINEK
        // ---------------------------------------------

        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "CELKEM SPOJŮ:",
            allTrips.length
        );


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyly načteny žádné spoje."
            );

            return [];
        }


        // ---------------------------------------------
        // PŘÍMÉ SPOJE
        // ---------------------------------------------

        const direct =
            findDirectConnections(
                allTrips,
                from,
                to,
                wantedTime,
                mode
            );


        console.log(
            "PŘÍMÉ SPOJE:",
            direct.length
        );


        // ---------------------------------------------
        // PŘESTUPNÍ SPOJE
        // ---------------------------------------------

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


        console.log(
            "PŘESTUPNÍ SPOJE:",
            transfers.length
        );


        // ---------------------------------------------
        // VŠECHNY VÝSLEDKY
        // ---------------------------------------------

        const result =
            selectBestConnections(
                direct,
                transfers,
                mode
            );


        console.log(
            "VÝSLEDKY:",
            result
        );


        console.log(
            "================================="
        );


        return result;
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

           
