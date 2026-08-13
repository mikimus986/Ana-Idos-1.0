// search.js

window.searchTimetable = (() => {

    const cache = new Map();

    // =====================================================
    // NASTAVENÍ
    // =====================================================

    const MAX_TRANSFERS = 4;

    const MAX_LEGS = MAX_TRANSFERS + 1;

    // Minimální doba na přestup
    const MIN_TRANSFER_TIME = 2;

    // Maximální počet výsledků
    const MAX_RESULTS = 30;

    // Maximální počet stavů při hledání přestupů
    const MAX_STATES = 1200;

    // Timeout načtení jednoho jízdního řádu
    const LOAD_TIMEOUT = 5000;


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


        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () => controller.abort(),
                LOAD_TIMEOUT
            );


        try {

            const response =
                await fetch(
                    `data/timetables/${encodeURIComponent(line)}.json`,
                    {
                        signal:
                            controller.signal
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `Linka ${line}: HTTP ${response.status}`
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
                    `Linka ${line} nemá platné directions.`
                );
            }


            cache.set(
                line,
                data
            );


            return data;

        } catch (error) {

            if (
                error.name === "AbortError"
            ) {

                throw new Error(
                    `Načtení linky ${line} trvalo příliš dlouho.`
                );
            }

            throw error;

        } finally {

            clearTimeout(
                timeout
            );
        }
    }


    // =====================================================
    // ČAS → MINUTY
    // =====================================================

    function timeToMinutes(time) {

        if (!time) {
            return 0;
        }


        const parts =
            String(time)
                .trim()
                .split(":");


        if (
            parts.length !== 2
        ) {
            return 0;
        }


        const hour =
            Number(parts[0]);

        const minute =
            Number(parts[1]);


        if (
            !Number.isFinite(hour) ||
            !Number.isFinite(minute)
        ) {
            return 0;
        }


        return (
            hour * 60 +
            minute
        );
    }


    // =====================================================
    // MINUTY → ČAS
    // =====================================================

    function minutesToTime(minutes) {

        minutes =
            ((Number(minutes) % 1440) + 1440) % 1440;


        const hour =
            Math.floor(
                minutes / 60
            );


        const minute =
            minutes % 60;


        return (
            String(hour).padStart(2, "0") +
            ":" +
            String(minute).padStart(2, "0")
        );
    }


    // =====================================================
    // ODJEZD
    // =====================================================

    function parseDeparture(value) {

        if (
            typeof value === "number"
        ) {

            if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > 59
            ) {
                return null;
            }


            return {

                minute:
                    value,

                isShortTrip:
                    false
            };
        }


        const text =
            String(value ?? "")
                .trim()
                .toUpperCase();


        if (!text) {
            return null;
        }


        const isShortTrip =
            text.endsWith("S");


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

            minute:
                minute,

            isShortTrip:
                isShortTrip
        };
    }


    // =====================================================
    // VYTVOŘENÍ SPOJŮ
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];


        if (
            !direction ||
            !Array.isArray(
                direction.stops
            ) ||
            !Array.isArray(
                direction.travelTimes
            )
        ) {

            return trips;
        }


        // -------------------------------------------------
        // TYP DNE
        // -------------------------------------------------

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


        // -------------------------------------------------
        // HODINY
        // -------------------------------------------------

        for (
            const hourKey of Object.keys(
                timetable
            )
        ) {

            const hour =
                Number(hourKey);


            if (
                !Number.isFinite(hour)
            ) {
                continue;
            }


            const departures =
                timetable[hourKey];


            if (
                !Array.isArray(
                    departures
                )
            ) {
                continue;
            }


            // -------------------------------------------------
            // ODJEZDY
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


                let stopCount =
                    direction.stops.length;


                let destination =
                    direction.destination || "";


                // -------------------------------------------------
                // ZKRÁCENÝ SPOJ S
                // -------------------------------------------------

                if (
                    parsed.isShortTrip
                ) {

                    const shortIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(
                                    stop
                                ) ===
                                normalizeStop(
                                    "Sminov, u lávky"
                                )
                        );


                    if (
                        shortIndex !== -1
                    ) {

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


                if (
                    stops.length < 2
                ) {
                    continue;
                }


                // -------------------------------------------------
                // JEDINEČNÉ ID
                // -------------------------------------------------

                const id = [
                    String(line),
                    String(
                        direction.id ?? ""
                    ),
                    firstTime,
                    parsed.isShortTrip
                        ? "S"
                        : "N"
                ].join("|");


                trips.push({

                    id:
                        id,

                    line:
                        String(line),

                    directionId:
                        direction.id ?? "",

                    destination:
                        destination,

                    isShortTrip:
                        parsed.isShortTrip,

                    firstDepartureMinutes:
                        firstTime,

                    stops:
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
            await loadTimetable(
                line
            );


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

        if (
            !Array.isArray(
                lineNumbers
            )
        ) {
            return [];
        }


        const allTrips = [];


        // -------------------------------------------------
        // Načteme linky současně
        // -------------------------------------------------

        const promises =
            lineNumbers.map(
                async line => {

                    try {

                        return await getTrips(
                            line,
                            dayType
                        );

                    } catch (error) {

                        console.warn(
                            `Linka ${line} nebyla načtena:`,
                            error.message
                        );

                        return [];
                    }
                }
            );


        const results =
            await Promise.all(
                promises
            );


        for (
            const trips of results
        ) {

            if (
                Array.isArray(
                    trips
                )
            ) {

                allTrips.push(
                    ...trips
                );
            }
        }


        // -------------------------------------------------
        // DEDUPLIKACE SAMOTNÝCH SPOJŮ
        // -------------------------------------------------

        const uniqueTrips = [];

        const seen =
            new Set();


        for (
            const trip of allTrips
        ) {

            const key = [
                trip.line,
                trip.directionId,
                trip.firstDepartureMinutes,
                trip.isShortTrip
                    ? "S"
                    : "N"
            ].join("|");


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            uniqueTrips.push(
                trip
            );
        }


        console.log(
            "NAČTENÉ UNIKÁTNÍ SPOJE:",
            uniqueTrips.length
        );


        return uniqueTrips;
    }


    // =====================================================
    // NAJDI ÚSEK
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
            normalizeStop(
                from
            );


        const toKey =
            normalizeStop(
                to
            );


        const fromIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    fromKey
            );


        if (
            fromIndex === -1
        ) {
            return null;
        }


        const toIndex =
            trip.stops.findIndex(
                (
                    stop,
                    index
                ) =>
                    index > fromIndex &&
                    normalizeStop(
                        stop.name
                    ) ===
                    toKey
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
    // ÚSEK OD INDEXU
    // =====================================================

    function getSegmentFromIndex(
        trip,
        fromIndex,
        to
    ) {

        const toKey =
            normalizeStop(
                to
            );


        const toIndex =
            trip.stops.findIndex(
                (
                    stop,
                    index
                ) =>
                    index > fromIndex &&
                    normalizeStop(
                        stop.name
                    ) ===
                    toKey
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


                if (
                    !index.has(key)
                ) {

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
    // VYTVOŘENÍ LEGU
    // =====================================================

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
    // DEDUPLIKACE
    // =====================================================

    function removeDuplicates(
        connections
    ) {

        const result = [];

        const seen =
            new Set();


        for (
            const connection
            of connections
        ) {

            let key;


            // -------------------------------------------------
            // PŘÍMÝ SPOJ
            // -------------------------------------------------

            if (
                connection.type ===
                "direct"
            ) {

                key = [
                    "D",
                    connection.tripId,
                    connection.from,
                    connection.to
                ].join("|");

            }

            // -------------------------------------------------
            // PŘESTUP
            // -------------------------------------------------

            else {

                key = [
                    "T",
                    ...connection.legs.map(
                        leg =>
                            [
                                leg.tripId,
                                leg.from,
                                leg.to
                            ].join(":")
                    )
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


        const waiting =
            journey.totalWaiting || 0;


        const totalTime =
            last.arrivalMinutes -
            first.departureMinutes;


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


        const starting =
            stopIndex.get(
                normalizeStop(
                    from
                )
            ) || [];


        const queue = [];


        // -------------------------------------------------
        // START
        // -------------------------------------------------

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


            // Přímý spoj řešíme zvlášť
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

                trip:
                    trip,

                stopIndex:
                    index,

                stopName:
                    from,

                legs:
                    [],

                transfers:
                    0,

                totalWaiting:
                    0,

                visited:
                    new Set([
                        trip.id
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


            const startIndex =
                state.stopIndex;


            // -------------------------------------------------
            // PŘESTUPNÍ ZASTÁVKY
            // -------------------------------------------------

            for (
                let i =
                    startIndex + 1;

                i <
                trip.stops.length;

                i++
            ) {

                const transferStop =
                    trip.stops[i];


                const transferName =
                    transferStop.name;


                const arrival =
                    transferStop.minutes;


                const candidates =
                    stopIndex.get(
                        normalizeStop(
                            transferName
                        )
                    ) || [];


                // -------------------------------------------------
                // DALŠÍ LINKY
                // -------------------------------------------------

                for (
                    const candidate
                    of candidates
                ) {

                    const nextTrip =
                        candidate.trip;


                    const nextIndex =
                        candidate.index;


                    if (
                        state.visited.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    const nextStop =
                        nextTrip.stops[
                            nextIndex
                        ];


                    const departure =
                        nextStop.minutes;


                    // Přestup musí být možný
                    if (
                        departure <
                        arrival +
                        MIN_TRANSFER_TIME
                    ) {
                        continue;
                    }


                    // -------------------------------------------------
                    // NOVÝ LEG
                    // -------------------------------------------------

                    const currentLeg =
                        makeLeg(
                            trip,

                            {
                                stops:
                                    trip.stops.slice(
                                        startIndex,
                                        i + 1
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
                                    arrival
                            },

                            state.stopName,

                            transferName
                        );


                    const newLegs = [
                        ...state.legs,
                        currentLeg
                    ];


                    // -------------------------------------------------
                    // JEDE DALŠÍ LINKA DO CÍLE?
                    // -------------------------------------------------

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


                        const legs = [
                            ...newLegs,
                            finalLeg
                        ];


                        const journey = {

                            type:
                                "transfer",

                            legs:
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
                                (
                                    departure -
                                    arrival
                                ),

                            transferStops:
                                legs
                                    .slice(
                                        0,
                                        -1
                                    )
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
                    // MAX 4 PŘESTUPY
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


                    queue.push({

                        trip:
                            nextTrip,

                        stopIndex:
                            nextIndex,

                        stopName:
                            transferName,

                        legs:
                            newLegs,

                        transfers:
                            state.transfers + 1,

                        totalWaiting:
                            state.totalWaiting +
                            (
                                departure -
                                arrival
                            ),

                        visited:
                            visited
                    });
                }
            }
        }


        console.log(
            "PŘESTUPY:",
            results.length,
            "STAVŮ:",
            processed
        );


        // -------------------------------------------------
        // DEDUPLIKACE
        // -------------------------------------------------

        const unique =
            removeDuplicates(
                results
            );


        // -------------------------------------------------
        // NEJVÝHODNĚJŠÍ
        // -------------------------------------------------

        unique.sort(
            (
                a,
                b
            ) =>
                journeyScore(a) -
                journeyScore(b)
        );


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
            "================================"
        );

        console.log(
            "HLEDÁM:",
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
            "LINEK:",
            lineNumbers.length
        );


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
                afterTime ||
                "00:00"
            );


        // =================================================
        // NAČTENÍ
        // =================================================

        console.log(
            "NAČÍTÁM JÍZDNÍ ŘÁDY..."
        );


        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
            );


        console.log(
            "HOTOVO – SPOJŮ:",
            allTrips.length
        );


        if (
            allTrips.length === 0
        ) {
            return [];
        }


        // =================================================
        // PŘÍMÉ
        // =================================================

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


        console.log(
            "PŘÍMÝCH SPOJŮ:",
            direct.length
        );


        // =================================================
        // PŘESTUPY
        // =================================================

        let transfers = [];


        if (
            mode === "departure"
        ) {

            console.log(
                "HLEDÁM PŘESTUPY..."
            );


            transfers =
                findTransferConnections(
                    allTrips,
                    from,
                    to,
                    wantedTime
                );


            console.log(
                "PŘESTUPNÍCH SPOJŮ:",
                transfers.length
            );
        }


        // =================================================
        // SPOJENÍ
        // =================================================

        let results = [
            ...direct,
            ...transfers
        ];


        // =================================================
        // FINÁLNÍ DEDUPLIKACE
        // =================================================

        results =
            removeDuplicates(
                results
            );


        // =================================================
        // SEŘAZENÍ
        // =================================================

        if (
            mode === "departure"
        ) {

            results.sort(
                (
                    a,
                    b
                ) => {

                    if (
                        a.departureMinutes !==
                        b.departureMinutes
                    ) {

                        return (
                            a.departureMinutes -
                            b.departureMinutes
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

            results.sort(
                (
                    a,
                    b
                ) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        console.log(
            "FINÁLNÍ POČET:",
            results.length
        );


        return results.slice(
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
