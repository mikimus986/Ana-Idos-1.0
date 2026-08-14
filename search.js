// search.js

window.searchTimetable = (() => {

    // =====================================================
    // NASTAVENÍ
    // =====================================================

    const MAX_TRANSFERS = 4;
    const MAX_RESULTS = 30;

    // Minimální čas potřebný na přestup
    const MIN_TRANSFER_TIME = 2;

    // Ochrana proti nekonečnému hledání
    const MAX_STATES = 10000;


    // =====================================================
    // CACHE
    // =====================================================

    const timetableCache = new Map();


    // =====================================================
    // NORMALIZACE ZASTÁVKY
    // =====================================================

    function normalizeStop(name) {

        return String(name ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }


    // =====================================================
    // ČAS → MINUTY
    // =====================================================

    function timeToMinutes(time) {

        if (typeof time === "number") {
            return time;
        }

        const text =
            String(time ?? "").trim();

        const parts =
            text.split(":");

        if (parts.length !== 2) {
            return NaN;
        }

        const hour =
            Number(parts[0]);

        const minute =
            Number(parts[1]);

        if (
            !Number.isFinite(hour) ||
            !Number.isFinite(minute)
        ) {
            return NaN;
        }

        return hour * 60 + minute;
    }


    // =====================================================
    // MINUTY → ČAS
    // =====================================================

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
            Math.floor(value % 60);

        return (
            String(hour).padStart(2, "0") +
            ":" +
            String(minute).padStart(2, "0")
        );
    }


    // =====================================================
    // PARSOVÁNÍ ODJEZDU
    //
    // například:
    // 21
    // 41S
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
    // NAČTENÍ JÍZDNÍHO ŘÁDU
    // =====================================================

    async function loadTimetable(line) {

        const lineString =
            String(line).trim();

        if (!lineString) {
            throw new Error(
                "Chybí číslo linky."
            );
        }

        if (
            timetableCache.has(
                lineString
            )
        ) {
            return timetableCache.get(
                lineString
            );
        }

        const url =
            `data/timetables/${encodeURIComponent(lineString)}.json`;

        try {

            const response =
                await fetch(url);

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            const data =
                await response.json();

            if (
                !data ||
                !Array.isArray(
                    data.directions
                )
            ) {

                throw new Error(
                    "Neplatný formát jízdního řádu."
                );
            }

            timetableCache.set(
                lineString,
                data
            );

            return data;

        } catch (error) {

            console.error(
                `Nelze načíst jízdní řád linky ${lineString}:`,
                error
            );

            throw error;
        }
    }


    // =====================================================
    // ZÍSKÁNÍ JÍZDNÍHO ŘÁDU PRO DEN
    // =====================================================

    function getDayTimetable(
        direction,
        dayType
    ) {

        if (!direction) {
            return null;
        }

        if (
            direction[dayType] &&
            typeof direction[dayType] === "object"
        ) {
            return direction[dayType];
        }

        // Ochrana proti různým názvům
        if (
            dayType === "weekdays" &&
            direction.weekday
        ) {
            return direction.weekday;
        }

        if (
            dayType === "weekends" &&
            direction.weekend
        ) {
            return direction.weekend;
        }

        if (
            dayType === "weekday" &&
            direction.weekdays
        ) {
            return direction.weekdays;
        }

        if (
            dayType === "weekend" &&
            direction.weekends
        ) {
            return direction.weekends;
        }

        return null;
    }


    // =====================================================
    // VYTVOŘENÍ VŠECH SPOJŮ Z JEDNOHO SMĚRU
    // =====================================================

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

        const timetable =
            getDayTimetable(
                direction,
                dayType
            );

        if (!timetable) {
            return trips;
        }

        const stops =
            direction.stops;

        const travelTimes =
            direction.travelTimes;


        // -------------------------------------------------
        // KAŽDÁ HODINA
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


            // -------------------------------------------------
            // KAŽDÝ ODJEZD
            // -------------------------------------------------

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
                    hour * 60 +
                    parsed.minute;


                // -------------------------------------------------
                // URČENÍ DÉLKY TRASY
                // -------------------------------------------------

                let stopCount =
                    stops.length;

                let destination =
                    direction.destination || "";


                // -------------------------------------------------
                // ZKRÁCENÝ SPOJ S
                // -------------------------------------------------

                if (
                    parsed.isShortTrip
                ) {

                    const shortStop =
                        "Sminov, u lávky";

                    const shortIndex =
                        stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
                                normalizeStop(shortStop)
                        );

                    if (
                        shortIndex !== -1
                    ) {

                        stopCount =
                            shortIndex + 1;

                        destination =
                            shortStop;
                    }
                }


                const tripStops = [];


                // -------------------------------------------------
                // VYTVOŘENÍ ZASTÁVEK SPOJE
                // -------------------------------------------------

                for (
                    let i = 0;
                    i < stopCount;
                    i++
                ) {

                    const stopName =
                        stops[i];

                    const travelTime =
                        Number(
                            travelTimes[i]
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

                    tripStops.push({

                        name:
                            stopName,

                        minutes:
                            absoluteTime,

                        time:
                            minutesToTime(
                                absoluteTime
                            )
                    });
                }


                if (
                    tripStops.length < 2
                ) {
                    continue;
                }


                // -------------------------------------------------
                // ID KONKRÉTNÍHO SPOJE
                //
                // Důležité:
                // stejný spoj se díky tomuto ID
                // nebude vracet vícekrát.
                // -------------------------------------------------

                const tripId = [
                    String(line),
                    String(
                        direction.id ??
                        direction.destination ??
                        ""
                    ),
                    firstTime,
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

                    destination:
                        destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    stops:
                        tripStops
                });
            }
        }

        return trips;
    }


    // =====================================================
    // VŠECHNY SPOJE JEDNÉ LINKY
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
    // VŠECHNY SPOJE VŠECH LINEK
    // =====================================================

    async function loadAllTrips(
        lineNumbers,
        dayType
    ) {

        if (
            !Array.isArray(lineNumbers)
        ) {
            return [];
        }

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
                                `Linka ${line} se nepodařila načíst.`,
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

            allTrips.push(
                ...trips
            );
        }


        // Bezpečné odstranění duplicit
        const seen =
            new Set();

        const uniqueTrips = [];

        for (
            const trip of allTrips
        ) {

            if (
                seen.has(trip.id)
            ) {
                continue;
            }

            seen.add(
                trip.id
            );

            uniqueTrips.push(
                trip
            );
        }


        console.log(
            "NAČTENO SPOJŮ:",
            uniqueTrips.length
        );

        return uniqueTrips;
    }


    // =====================================================
    // NAJDI ZASTÁVKU V TRIPU
    // =====================================================

    function findStopIndex(
        trip,
        stopName,
        startIndex = 0
    ) {

        if (
            !trip ||
            !Array.isArray(trip.stops)
        ) {
            return -1;
        }

        const target =
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
                ) === target
            ) {
                return i;
            }
        }

        return -1;
    }


    // =====================================================
    // ÚSEK SPOJE
    // =====================================================

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

        if (
            fromIndex === -1
        ) {
            return null;
        }

        const toIndex =
            findStopIndex(
                trip,
                to,
                fromIndex + 1
            );

        if (
            toIndex === -1
        ) {
            return null;
        }

        const departureStop =
            trip.stops[
                fromIndex
            ];

        const arrivalStop =
            trip.stops[
                toIndex
            ];

        return {

            fromIndex,

            toIndex,

            departure:
                departureStop.time,

            arrival:
                arrivalStop.time,

            departureMinutes:
                departureStop.minutes,

            arrivalMinutes:
                arrivalStop.minutes,

            stops:
                trip.stops.slice(
                    fromIndex,
                    toIndex + 1
                )
        };
    }


    // =====================================================
    // VYTVOŘENÍ LEGU
    // =====================================================

    function makeLeg(
        trip,
        segment
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
                segment.stops[0].name,

            to:
                segment.stops[
                    segment.stops.length - 1
                ].name,

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


            // -------------------------------------------------
            // ODJEZD
            // -------------------------------------------------

            if (
                mode === "departure" &&
                segment.departureMinutes <
                wantedTime
            ) {
                continue;
            }


            // -------------------------------------------------
            // PŘÍJEZD
            // -------------------------------------------------

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
            });
        }

        return results;
    }


    // =====================================================
    // INDEX ZASTÁVEK
    // =====================================================

    function buildStopIndex(
        allTrips
    ) {

        const index =
            new Map();

        for (
            const trip of allTrips
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

                    index:
                        i
                });
            }
        }

        return index;
    }


    // =====================================================
    // SKÓRE SPOJE
    // =====================================================

    function scoreJourney(
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
         * Nižší skóre = lepší spoj.
         *
         * Nejdůležitější je:
         * 1. příjezd
         * 2. počet přestupů
         * 3. čekání
         * 4. celková délka cesty
         */

        return (
            last.arrivalMinutes * 1000000 +
            transfers * 10000 +
            waiting * 10 +
            totalTime
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
            !allTrips.length
        ) {
            return results;
        }


        const stopIndex =
            buildStopIndex(
                allTrips
            );


        const fromKey =
            normalizeStop(
                from
            );


        const startOccurrences =
            stopIndex.get(
                fromKey
            ) || [];


        // -------------------------------------------------
        // FRONTA
        // -------------------------------------------------

        const queue = [];


        for (
            const occurrence
            of startOccurrences
        ) {

            const trip =
                occurrence.trip;

            const startIndex =
                occurrence.index;

            const startStop =
                trip.stops[
                    startIndex
                ];


            if (
                startStop.minutes <
                wantedTime
            ) {
                continue;
            }


            // -------------------------------------------------
            // Pokud tento spoj jede rovnou do cíle,
            // řeší ho direct search.
            // -------------------------------------------------

            const direct =
                getSegment(
                    trip,
                    from,
                    to
                );

            if (direct) {
                continue;
            }


            queue.push({

                trip,

                stopIndex:
                    startIndex,

                legs: [],

                transfers:
                    0,

                totalWaiting:
                    0,

                firstDeparture:
                    startStop.minutes,

                visitedTrips:
                    new Set([
                        trip.id
                    ]),

                visitedStops:
                    new Set([
                        fromKey
                    ])
            });
        }


        let processed =
            0;


        // -------------------------------------------------
        // PROHLEDÁVÁNÍ
        // -------------------------------------------------

        while (
            queue.length > 0 &&
            processed < MAX_STATES
        ) {

            const state =
                queue.shift();

            processed++;


            const trip =
                state.trip;


            // -------------------------------------------------
            // PROJDEME VŠECHNY ZASTÁVKY PO TRASĚ
            // -------------------------------------------------

            for (
                let transferIndex =
                    state.stopIndex + 1;

                transferIndex <
                trip.stops.length;

                transferIndex++
            ) {

                const transferStop =
                    trip.stops[
                        transferIndex
                    ];


                const transferKey =
                    normalizeStop(
                        transferStop.name
                    );


                const arrivalAtTransfer =
                    transferStop.minutes;


                // -------------------------------------------------
                // ZABRÁNÍME ZBYTEČNÝM CYKLŮM
                // -------------------------------------------------

                if (
                    state.visitedStops.has(
                        transferKey
                    ) &&
                    transferKey !==
                    normalizeStop(from)
                ) {
                    // Nezakazujeme úplně opakovanou zastávku,
                    // ale omezíme zbytečné cykly.
                }


                // -------------------------------------------------
                // VŠECHNY SPOJE Z TÉTO ZASTÁVKY
                // -------------------------------------------------

                const occurrences =
                    stopIndex.get(
                        transferKey
                    ) || [];


                for (
                    const occurrence
                    of occurrences
                ) {

                    const nextTrip =
                        occurrence.trip;

                    const nextIndex =
                        occurrence.index;


                    // Stejný konkrétní spoj
                    if (
                        state.visitedTrips.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    const nextDepartureStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    if (!nextDepartureStop) {
                        continue;
                    }


                    const nextDeparture =
                        nextDepartureStop.minutes;


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
                    // ZKUSÍME, JESTLI DALŠÍ SPOJ
                    // JEDE AŽ DO CÍLE
                    // -------------------------------------------------

                    const finalSegment =
                        getSegment(
                            nextTrip,
                            transferStop.name,
                            to,
                            nextIndex
                        );


                    // -------------------------------------------------
                    // AKTUÁLNÍ LEG
                    // -------------------------------------------------

                    const currentSegment = {

                        stops:
                            trip.stops.slice(
                                state.stopIndex,
                                transferIndex + 1
                            ),

                        departure:
                            trip.stops[
                                state.stopIndex
                            ].time,

                        arrival:
                            transferStop.time,

                        departureMinutes:
                            trip.stops[
                                state.stopIndex
                            ].minutes,

                        arrivalMinutes:
                            arrivalAtTransfer
                    };


                    const currentLeg =
                        makeLeg(
                            trip,
                            currentSegment
                        );


                    const newLegs =
                        [
                            ...state.legs,
                            currentLeg
                        ];


                    // =================================================
                    // CÍL DOSAŽEN
                    // =================================================

                    if (finalSegment) {

                        const finalLeg =
                            makeLeg(
                                nextTrip,
                                finalSegment
                            );


                        const legs =
                            [
                                ...newLegs,
                                finalLeg
                            ];


                        const waiting =
                            nextDeparture -
                            arrivalAtTransfer;


                        const journey = {

                            type:
                                "transfer",

                            legs,

                            transfers:
                                legs.length - 1,

                            departure:
                                legs[0].departure,

                            arrival:
                                finalLeg.arrival,

                            departureMinutes:
                                legs[0].departureMinutes,

                            arrivalMinutes:
                                finalLeg.arrivalMinutes,

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
                    // MAXIMÁLNĚ 4 PŘESTUPY
                    // -------------------------------------------------

                    if (
                        state.transfers >=
                        MAX_TRANSFERS
                    ) {
                        continue;
                    }


                    // -------------------------------------------------
                    // DALŠÍ STAV
                    // -------------------------------------------------

                    const visitedTrips =
                        new Set(
                            state.visitedTrips
                        );

                    visitedTrips.add(
                        nextTrip.id
                    );


                    const visitedStops =
                        new Set(
                            state.visitedStops
                        );

                    visitedStops.add(
                        transferKey
                    );


                    queue.push({

                        trip:
                            nextTrip,

                        stopIndex:
                            nextIndex,

                        legs:
                            newLegs,

                        transfers:
                            state.transfers + 1,

                        totalWaiting:
                            state.totalWaiting +
                            waiting,

                        firstDeparture:
                            state.firstDeparture,

                        visitedTrips,

                        visitedStops
                    });
                }
            }
        }


        console.log(
            "PROZKOUMÁNO STAVŮ:",
            processed
        );


        return results;
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICITNÍCH SPOJENÍ
    // =====================================================

    function removeDuplicateConnections(
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
                                [
                                    leg.line,
                                    leg.directionId,
                                    leg.departure,
                                    leg.arrival,
                                    leg.from,
                                    leg.to
                                ].join(":")
                        )
                        .join("|");

            } else {

                key =
                    [
                        connection.type,
                        connection.tripId,
                        connection.departure,
                        connection.arrival
                    ].join("|");
            }


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(
                key
            );

            result.push(
                connection
            );
        }


        return result;
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
            "REŽIM:",
            mode
        );


        // -------------------------------------------------
        // KONTROLA
        // -------------------------------------------------

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
            !Array.isArray(lineNumbers) ||
            lineNumbers.length === 0
        ) {
            console.error(
                "Nebyla předána žádná linka."
            );

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
            return [];
        }


        // -------------------------------------------------
        // NAČTENÍ VŠECH LINEK
        // -------------------------------------------------

        let allTrips = [];

        try {

            allTrips =
                await loadAllTrips(
                    lineNumbers,
                    dayType
                );

        } catch (error) {

            console.error(
                "CHYBA PŘI NAČÍTÁNÍ JÍZDNÍCH ŘÁDŮ:",
                error
            );

            return [];
        }


        if (
            allTrips.length === 0
        ) {

            console.error(
                "Nebyl nalezen žádný jízdní řád."
            );

            return [];
        }


        console.log(
            "CELKEM SPOJŮ:",
            allTrips.length
        );


        // -------------------------------------------------
        // PŘÍMÉ SPOJE
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
        // PŘESTUPNÍ SPOJE
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
        // SPOJÍME VÝSLEDKY
        // -------------------------------------------------

        let connections =
            [
                ...direct,
                ...transfers
            ];


        // -------------------------------------------------
        // DUPLICITY
        // -------------------------------------------------

        connections =
            removeDuplicateConnections(
                connections
            );


        // -------------------------------------------------
        // SEŘAZENÍ
        // -------------------------------------------------

        if (
            mode === "departure"
        ) {

            connections.sort(
                (a, b) => {

                    // Nejprve podle odjezdu
                    if (
                        a.departureMinutes !==
                        b.departureMinutes
                    ) {

                        return (
                            a.departureMinutes -
                            b.departureMinutes
                        );
                    }


                    // Pokud odjíždí stejně,
                    // preferujeme méně přestupů
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

            connections.sort(
                (a, b) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        // -------------------------------------------------
        // VÝBĚR NEJVÝHODNĚJŠÍCH
        // -------------------------------------------------

        const finalResults =
            connections.slice(
                0,
                MAX_RESULTS
            );


        console.log(
            "NALEZENÉ SPOJE:",
            finalResults
        );


        console.log(
            "POČET:",
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

           
