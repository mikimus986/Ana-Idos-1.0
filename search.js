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

        const parts =
            String(time).split(":");

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
    // NORMALIZACE ZASTÁVKY
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
    // VYTVOŘENÍ SPOJŮ
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

            if (dayType === "weekend") {
                timetable =
                    direction.weekends;
            }

            if (dayType === "weekday") {
                timetable =
                    direction.weekdays;
            }
        }

        if (!timetable) {
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
                    direction.destination;


                // -----------------------------------------
                // SPOJ S
                // -----------------------------------------

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


                // -----------------------------------------
                // ZASTÁVKY
                // -----------------------------------------

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

        const allTrips = [];

        for (
            const line
            of lineNumbers
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

                trip:
                    trip
            });
        }

        return results;
    }


    // =====================================================
    // NAJDE VŠECHNY MOŽNÉ PŘESTUPNÍ ZASTÁVKY
    // =====================================================

    function getTransferStops(
        firstTrip,
        secondTrip,
        from,
        to
    ) {

        const result = [];

        const fromIndex =
            firstTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(from)
            );

        const secondToIndex =
            secondTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(to)
            );

        if (
            fromIndex === -1 ||
            secondToIndex === -1
        ) {
            return result;
        }


        // -----------------------------------------
        // VŠECHNY SPOLEČNÉ ZASTÁVKY
        // -----------------------------------------

        for (
            let firstIndex = fromIndex + 1;
            firstIndex < firstTrip.stops.length;
            firstIndex++
        ) {

            const firstStop =
                firstTrip.stops[firstIndex];


            for (
                let secondIndex = 0;
                secondIndex < secondToIndex;
                secondIndex++
            ) {

                const secondStop =
                    secondTrip.stops[secondIndex];


                if (
                    normalizeStop(
                        firstStop.name
                    ) !==
                    normalizeStop(
                        secondStop.name
                    )
                ) {
                    continue;
                }


                const wait =
                    secondStop.minutes -
                    firstStop.minutes;


                // ---------------------------------
                // MINIMÁLNĚ 1 MINUTA NA PŘESTUP
                // ---------------------------------

                if (wait < 1) {
                    continue;
                }


                result.push({

                    name:
                        firstStop.name,

                    firstIndex:
                        firstIndex,

                    secondIndex:
                        secondIndex,

                    arrival:
                        firstStop.time,

                    arrivalMinutes:
                        firstStop.minutes,

                    departure:
                        secondStop.time,

                    departureMinutes:
                        secondStop.minutes,

                    wait:
                        wait
                });
            }
        }


        return result;
    }


    // =====================================================
    // VYTVÁŘENÍ PŘESTUPOVÉHO SPOJENÍ
    // =====================================================

    function createTransferConnection(
        firstTrip,
        secondTrip,
        from,
        to,
        wantedTime,
        mode
    ) {

        const fromIndex =
            firstTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(from)
            );

        const toIndex =
            secondTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(to)
            );

        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return [];
        }


        const possibleTransfers =
            getTransferStops(
                firstTrip,
                secondTrip,
                from,
                to
            );


        const results = [];


        for (
            const transfer
            of possibleTransfers
        ) {

            const firstDeparture =
                firstTrip.stops[fromIndex];


            const finalArrival =
                secondTrip.stops[toIndex];


            if (
                finalArrival.minutes <=
                transfer.departureMinutes
            ) {
                continue;
            }


            if (
                mode === "departure" &&
                firstDeparture.minutes < wantedTime
            ) {
                continue;
            }


            if (
                mode === "arrival" &&
                finalArrival.minutes > wantedTime
            ) {
                continue;
            }


            const firstStops =
                firstTrip.stops.slice(
                    fromIndex,
                    transfer.firstIndex + 1
                );


            const secondStops =
                secondTrip.stops.slice(
                    transfer.secondIndex,
                    toIndex + 1
                );


            results.push({

                type:
                    "transfer",

                from:
                    from,

                to:
                    to,

                departure:
                    firstDeparture.time,

                arrival:
                    finalArrival.time,

                departureMinutes:
                    firstDeparture.minutes,

                arrivalMinutes:
                    finalArrival.minutes,

                destination:
                    secondTrip.destination,

                line:
                    firstTrip.line,

                directionId:
                    firstTrip.directionId,

                isShortTrip:
                    firstTrip.isShortTrip,

                stops:
                    firstStops,

                transfer: {

                    stop:
                        transfer.name,

                    arrival:
                        transfer.arrival,

                    arrivalMinutes:
                        transfer.arrivalMinutes,

                    departure:
                        transfer.departure,

                    departureMinutes:
                        transfer.departureMinutes,

                    wait:
                        transfer.wait,

                    waitTime:
                        minutesToTime(
                            transfer.wait
                        )
                },

                secondLine:
                    secondTrip.line,

                secondDirectionId:
                    secondTrip.directionId,

                secondDestination:
                    secondTrip.destination,

                secondIsShortTrip:
                    secondTrip.isShortTrip,

                secondStops:
                    secondStops,

                firstTrip:
                    firstTrip,

                secondTrip:
                    secondTrip
            });
        }


        return results;
    }


    // =====================================================
    // ODSTRANĚNÍ DUPLICIT
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

                connection.secondLine || "",

                connection.departure,

                connection.transfer
                    ? connection.transfer.stop
                    : "",

                connection.transfer
                    ? connection.transfer.departure
                    : "",

                connection.arrival

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
    // VÍCE PŘESTUPŮ
    //
    // Hledá nejlepší trasu:
    //
    // 1 → 2
    // 1 → 2 → 5
    // 1 → 3 → 5 → 7
    //
    // Hodnotí CELKOVÝ ČAS cesty.
    // =====================================================

    function findBestMultiTransfer(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const MAX_TRANSFERS = 3;

        const results = [];

        const visitedStates =
            new Set();


        // -------------------------------------------------
        // FRONTIER
        // -------------------------------------------------

        let frontier = [];


        // -------------------------------------------------
        // PRVNÍ LINKY
        // -------------------------------------------------

        for (
            const trip
            of allTrips
        ) {

            const fromIndex =
                trip.stops.findIndex(
                    stop =>
                        normalizeStop(
                            stop.name
                        ) ===
                        normalizeStop(from)
                );

            if (fromIndex === -1) {
                continue;
            }


            const departure =
                trip.stops[fromIndex];


            if (
                mode === "departure" &&
                departure.minutes < wantedTime
            ) {
                continue;
            }


            frontier.push({

                trip:
                    trip,

                currentStop:
                    from,

                departureMinutes:
                    departure.minutes,

                departure:
                    departure.time,

                legs: [],

                usedLines:
                    new Set([
                        trip.line
                    ]),

                usedTrips:
                    new Set([
                        trip.id
                    ]),

                transfers: 0
            });
        }


        // -------------------------------------------------
        // VYHLEDÁVÁNÍ
        // -------------------------------------------------

        for (
            let level = 0;
            level <= MAX_TRANSFERS;
            level++
        ) {

            const nextFrontier = [];


            for (
                const state
                of frontier
            ) {

                const currentTrip =
                    state.trip;


                const currentIndex =
                    currentTrip.stops.findIndex(
                        stop =>
                            normalizeStop(
                                stop.name
                            ) ===
                            normalizeStop(
                                state.currentStop
                            )
                    );


                if (currentIndex === -1) {
                    continue;
                }


                // =========================================
                // JE CÍL NA TÉTO LINCE?
                // =========================================

                const destinationIndex =
                    currentTrip.stops.findIndex(
                        (stop, index) =>
                            index > currentIndex &&
                            normalizeStop(
                                stop.name
                            ) ===
                            normalizeStop(to)
                    );


                if (
                    destinationIndex !== -1
                ) {

                    const arrival =
                        currentTrip.stops[
                            destinationIndex
                        ];


                    if (
                        mode === "arrival" &&
                        arrival.minutes > wantedTime
                    ) {
                        continue;
                    }


                    const finalLeg = {

                        line:
                            currentTrip.line,

                        directionId:
                            currentTrip.directionId,

                        destination:
                            currentTrip.destination,

                        isShortTrip:
                            currentTrip.isShortTrip,

                        from:
                            state.currentStop,

                        to:
                            to,

                        departure:
                            currentTrip.stops[
                                currentIndex
                            ].time,

                        arrival:
                            arrival.time,

                        departureMinutes:
                            currentTrip.stops[
                                currentIndex
                            ].minutes,

                        arrivalMinutes:
                            arrival.minutes,

                        stops:
                            currentTrip.stops.slice(
                                currentIndex,
                                destinationIndex + 1
                            )
                    };


                    const legs = [

                        ...state.legs,

                        finalLeg

                    ];


                    results.push({

                        type:
                            "transfer",

                        from:
                            from,

                        to:
                            to,

                        departure:
                            state.departure,

                        arrival:
                            arrival.time,

                        departureMinutes:
                            state.departureMinutes,

                        arrivalMinutes:
                            arrival.minutes,

                        destination:
                            currentTrip.destination,

                        legs:
                            legs,

                        transfers:
                            Math.max(
                                0,
                                legs.length - 1
                            )
                    });


                    continue;
                }


                // =========================================
                // UŽ NEMÁME DĚLAT DALŠÍ PŘESTUP
                // =========================================

                if (
                    state.transfers >=
                    MAX_TRANSFERS
                ) {
                    continue;
                }


                // =========================================
                // HLEDÁME DALŠÍ LINKU
                // =========================================

                for (
                    const nextTrip
                    of allTrips
                ) {

                    if (
                        state.usedTrips.has(
                            nextTrip.id
                        )
                    ) {
                        continue;
                    }


                    // Stejná linka nemá smysl
                    // používat znovu.

                    if (
                        state.usedLines.has(
                            nextTrip.line
                        )
                    ) {
                        continue;
                    }


                    const transferOptions =
                        getTransferStops(
                            currentTrip,
                            nextTrip,
                            state.currentStop,
                            to
                        );


                    if (
                        transferOptions.length === 0
                    ) {
                        continue;
                    }


                    // -------------------------------------
                    // VYBEREME NEJLEPŠÍ PŘESTUP
                    // -------------------------------------

                    transferOptions.sort(
                        (a, b) => {

                            // hlavní kritérium:
                            // nejdřívější příjezd na konec

                            const aTotal =
                                a.departureMinutes;

                            const bTotal =
                                b.departureMinutes;

                            if (
                                aTotal !== bTotal
                            ) {
                                return (
                                    aTotal -
                                    bTotal
                                );
                            }

                            // potom kratší čekání

                            return (
                                a.wait -
                                b.wait
                            );
                        }
                    );


                    for (
                        const transfer
                        of transferOptions
                    ) {

                        const oldCurrentIndex =
                            currentTrip.stops.findIndex(
                                stop =>
                                    normalizeStop(
                                        stop.name
                                    ) ===
                                    normalizeStop(
                                        state.currentStop
                                    )
                            );


                        if (
                            oldCurrentIndex === -1
                        ) {
                            continue;
                        }


                        const oldDeparture =
                            currentTrip.stops[
                                oldCurrentIndex
                            ];


                        const firstLeg = {

                            line:
                                currentTrip.line,

                            directionId:
                                currentTrip.directionId,

                            destination:
                                currentTrip.destination,

                            isShortTrip:
                                currentTrip.isShortTrip,

                            from:
                                state.currentStop,

                            to:
                                transfer.name,

                            departure:
                                oldDeparture.time,

                            arrival:
                                transfer.arrival,

                            departureMinutes:
                                oldDeparture.minutes,

                            arrivalMinutes:
                                transfer.arrivalMinutes,

                            stops:
                                currentTrip.stops.slice(
                                    oldCurrentIndex,
                                    transfer.firstIndex + 1
                                )
                        };


                        const newState = {

                            trip:
                                nextTrip,

                            currentStop:
                                transfer.name,

                            departureMinutes:
                                state.departureMinutes,

                            departure:
                                state.departure,

                            legs: [

                                ...state.legs,

                                firstLeg

                            ],

                            usedLines:
                                new Set([
                                    ...state.usedLines,
                                    nextTrip.line
                                ]),

                            usedTrips:
                                new Set([
                                    ...state.usedTrips,
                                    nextTrip.id
                                ]),

                            transfers:
                                state.transfers + 1
                        };


                        const stateKey = [

                            nextTrip.id,

                            normalizeStop(
                                transfer.name
                            ),

                            state.transfers + 1

                        ].join("|");


                        if (
                            visitedStates.has(
                                stateKey
                            )
                        ) {
                            continue;
                        }


                        visitedStates.add(
                            stateKey
                        );


                        nextFrontier.push(
                            newState
                        );
                    }
                }
            }


            frontier =
                nextFrontier;


            if (
                frontier.length === 0
            ) {
                break;
            }
        }


        return results;
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


        const allTrips =
            await loadAllTrips(
                lineNumbers,
                dayType
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


        // =================================================
        // PŘESTUPY
        // =================================================

        let transfers =
            findBestMultiTransfer(
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


        // =================================================
        // PŘÍMÉ MAJÍ PRIORITU
        //
        // Přestup zobrazíme pouze tehdy,
        // pokud dorazí dříve než nejlepší přímý spoj.
        // =================================================

        if (
            direct.length > 0
        ) {

            let fastestDirectArrival =
                Infinity;


            for (
                const connection
                of direct
            ) {

                if (
                    connection.arrivalMinutes <
                    fastestDirectArrival
                ) {

                    fastestDirectArrival =
                        connection.arrivalMinutes;
                }
            }


            transfers =
                transfers.filter(
                    connection =>
                        connection.arrivalMinutes <
                        fastestDirectArrival
                );
        }


        // =================================================
        // VÝSLEDKY
        // =================================================

        let results = [

            ...direct,

            ...transfers

        ];


        if (
            mode === "departure"
        ) {

            results.sort(
                (a, b) => {

                    if (
                        a.departureMinutes !==
                        b.departureMinutes
                    ) {

                        return (
                            a.departureMinutes -
                            b.departureMinutes
                        );
                    }


                    return (
                        a.arrivalMinutes -
                        b.arrivalMinutes
                    );
                }
            );

        } else {

            results.sort(
                (a, b) =>
                    a.arrivalMinutes -
                    b.arrivalMinutes
            );
        }


        // =================================================
        // OMEZENÍ DUPLICITNÍCH STEJNÝCH CEST
        // =================================================

        const finalResults = [];

        const seen = new Set();


        for (
            const connection
            of results
        ) {

            let key;


            if (
                connection.type ===
                "direct"
            ) {

                key = [
                    "D",
                    connection.line,
                    connection.departure,
                    connection.arrival
                ].join("|");

            } else {

                const lines =
                    Array.isArray(
                        connection.legs
                    )
                        ? connection.legs
                            .map(
                                leg =>
                                    leg.line
                            )
                            .join("-")
                        : "";

                key = [
                    "T",
                    lines,
                    connection.departure,
                    connection.arrival,
                    connection.transfers
                ].join("|");
            }


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(key);

            finalResults.push(
                connection
            );


            if (
                finalResults.length >= 30
            ) {
                break;
            }
        }


        console.log(
            "PŘÍMÉ SPOJE:",
            direct
        );

        console.log(
            "PŘESTUPOVÉ SPOJE:",
            transfers
        );

        console.log(
            "VÝSLEDKY:",
            finalResults
        );


        return finalResults;
    }


    // =====================================================
    // EXPORT
    // =====================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections,

        findTransferConnections:
            findBestMultiTransfer

    };

})();
