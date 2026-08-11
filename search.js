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
    // ODJEZD Z JSON
    //
    // např.
    // 21
    // 41S
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
    // VYTVOŘENÍ SPOJŮ Z JEDNOHO SMĚRU
    // =====================================================

    function createTrips(
        line,
        direction,
        dayType
    ) {

        const trips = [];

        let timetable =
            direction[dayType];

        // ochrana před rozdílným názvem
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


        // ================================================
        // HODINY
        // ================================================

        for (
            const hour of Object.keys(timetable)
        ) {

            const departures =
                timetable[hour];

            if (!Array.isArray(departures)) {
                continue;
            }


            // ============================================
            // ODJEZDY
            // ============================================

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


                // ========================================
                // SPOJ S
                // ========================================

                if (
                    parsed.isShortTrip
                ) {

                    const shortIndex =
                        direction.stops.findIndex(
                            stop =>
                                normalizeStop(stop) ===
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


                // ========================================
                // ZASTÁVKY SPOJE
                // ========================================

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


                if (
                    stops.length < 2
                ) {
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
    // VŠECHNY LINKY
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
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(from)
            );


        const toIndex =
            trip.stops.findIndex(
                stop =>
                    normalizeStop(
                        stop.name
                    ) ===
                    normalizeStop(to)
            );


        if (
            fromIndex === -1 ||
            toIndex === -1
        ) {
            return null;
        }


        // Musí jet správným směrem
        if (
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
                trip.stops[
                    fromIndex
                ].time,

            departureMinutes:
                trip.stops[
                    fromIndex
                ].minutes,

            arrival:
                trip.stops[
                    toIndex
                ].time,

            arrivalMinutes:
                trip.stops[
                    toIndex
                ].minutes
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
    // PRVNÍ SPOLEČNÁ ZASTÁVKA
    //
    // Hledá první zastávku, kde:
    //
    // 1. první linka může vystoupit
    // 2. druhá linka tam může nastoupit
    // 3. druhá linka pokračuje směrem k cíli
    // =====================================================

    function findFirstTransferStop(
        firstTrip,
        secondTrip,
        from,
        to
    ) {

        const fromIndex =
            firstTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(from)
            );


        if (fromIndex === -1) {
            return null;
        }


        const secondToIndex =
            secondTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(to)
            );


        if (secondToIndex === -1) {
            return null;
        }


        // Procházíme první spoj od začátku
        // a bereme PRVNÍ vhodnou společnou zastávku.

        for (
            let i = fromIndex + 1;
            i < firstTrip.stops.length;
            i++
        ) {

            const firstStop =
                firstTrip.stops[i];


            const secondIndex =
                secondTrip.stops.findIndex(
                    (stop, index) =>
                        index < secondToIndex &&
                        normalizeStop(stop.name) ===
                        normalizeStop(
                            firstStop.name
                        )
                );


            if (
                secondIndex === -1
            ) {
                continue;
            }


            return {

                name:
                    firstStop.name,

                firstIndex:
                    i,

                secondIndex:
                    secondIndex,

                firstArrival:
                    firstStop.minutes,

                firstArrivalTime:
                    firstStop.time,

                secondDeparture:
                    secondTrip.stops[
                        secondIndex
                    ].minutes,

                secondDepartureTime:
                    secondTrip.stops[
                        secondIndex
                    ].time
            };
        }


        return null;
    }


    // =====================================================
    // PŘESTUPOVÉ SPOJENÍ
    // =====================================================

    function createTransferConnection(
        firstTrip,
        secondTrip,
        from,
        to,
        wantedTime,
        mode
    ) {

        const firstSegment =
            getSegment(
                firstTrip,
                from,
                firstTrip.stops[
                    firstTrip.stops.length - 1
                ].name
            );


        if (!firstSegment) {
            return null;
        }


        const transfer =
            findFirstTransferStop(
                firstTrip,
                secondTrip,
                from,
                to
            );


        if (!transfer) {
            return null;
        }


        // ================================================
        // ČAS PŘESTUPU
        //
        // minimálně 1 minuta
        // ================================================

        const transferWait =
            transfer.secondDeparture -
            transfer.firstArrival;


        if (
            transferWait < 1
        ) {
            return null;
        }


        // ================================================
        // ODJEZD Z VÝCHOZÍ ZASTÁVKY
        // ================================================

        const fromIndex =
            firstTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(from)
            );


        const firstDeparture =
            firstTrip.stops[
                fromIndex
            ];


        const destinationIndex =
            secondTrip.stops.findIndex(
                stop =>
                    normalizeStop(stop.name) ===
                    normalizeStop(to)
            );


        if (
            destinationIndex === -1
        ) {
            return null;
        }


        const secondDepartureStop =
            secondTrip.stops[
                transfer.secondIndex
            ];


        const finalArrivalStop =
            secondTrip.stops[
                destinationIndex
            ];


        if (
            finalArrivalStop.minutes <=
            secondDepartureStop.minutes
        ) {
            return null;
        }


        // ================================================
        // ODJEZDOVÝ REŽIM
        // ================================================

        if (
            mode === "departure" &&
            firstDeparture.minutes < wantedTime
        ) {
            return null;
        }


        // ================================================
        // PŘÍJEZDOVÝ REŽIM
        // ================================================

        if (
            mode === "arrival" &&
            finalArrivalStop.minutes > wantedTime
        ) {
            return null;
        }


        // ================================================
        // ZASTÁVKY PRVNÍHO SPOJE
        // ================================================

        const firstStops =
            firstTrip.stops.slice(
                fromIndex,
                transfer.firstIndex + 1
            );


        // ================================================
        // ZASTÁVKY DRUHÉHO SPOJE
        // ================================================

        const secondStops =
            secondTrip.stops.slice(
                transfer.secondIndex,
                destinationIndex + 1
            );


        return {

            type:
                "transfer",

            from:
                from,

            to:
                to,

            departure:
                firstDeparture.time,

            arrival:
                finalArrivalStop.time,

            departureMinutes:
                firstDeparture.minutes,

            arrivalMinutes:
                finalArrivalStop.minutes,

            destination:
                secondTrip.destination,

            // --------------------------------------------
            // PRVNÍ LINKA
            // --------------------------------------------

            line:
                firstTrip.line,

            directionId:
                firstTrip.directionId,

            isShortTrip:
                firstTrip.isShortTrip,

            stops:
                firstStops,

            // --------------------------------------------
            // PŘESTUP
            // --------------------------------------------

            transfer: {

                stop:
                    transfer.name,

                arrival:
                    transfer.firstArrivalTime,

                arrivalMinutes:
                    transfer.firstArrival,

                departure:
                    transfer.secondDepartureTime,

                departureMinutes:
                    transfer.secondDeparture,

                wait:
                    transferWait,

                waitTime:
                    minutesToTime(
                        transferWait
                    )
            },

            // --------------------------------------------
            // DRUHÁ LINKA
            // --------------------------------------------

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
        };
    }


    // =====================================================
    // VYHLEDÁNÍ PŘESTUPŮ
    // =====================================================

    function findTransferConnections(
        allTrips,
        from,
        to,
        wantedTime,
        mode
    ) {

        const results = [];


        // ================================================
        // Každý první spoj
        // ================================================

        for (
            const firstTrip
            of allTrips
        ) {

            // Musí obsahovat výchozí zastávku

            const firstFromIndex =
                firstTrip.stops.findIndex(
                    stop =>
                        normalizeStop(stop.name) ===
                        normalizeStop(from)
                );


            if (
                firstFromIndex === -1
            ) {
                continue;
            }


            // ============================================
            // Každý druhý spoj
            // ============================================

            for (
                const secondTrip
                of allTrips
            ) {

                // Nemá smysl přestupovat na stejný spoj

                if (
                    firstTrip.id ===
                    secondTrip.id
                ) {
                    continue;
                }


                // Druhý spoj musí vést do cíle

                const secondToIndex =
                    secondTrip.stops.findIndex(
                        stop =>
                            normalizeStop(stop.name) ===
                            normalizeStop(to)
                    );


                if (
                    secondToIndex === -1
                ) {
                    continue;
                }


                const connection =
                    createTransferConnection(
                        firstTrip,
                        secondTrip,
                        from,
                        to,
                        wantedTime,
                        mode
                    );


                if (!connection) {
                    continue;
                }


                results.push(
                    connection
                );
            }
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

            let key;


            if (
                connection.type ===
                "direct"
            ) {

                key = [
                    "direct",
                    connection.line,
                    connection.directionId,
                    connection.departure,
                    connection.arrival
                ].join("|");

            } else {

                key = [
                    "transfer",
                    connection.line,
                    connection.secondLine,
                    connection.departure,
                    connection.transfer.stop,
                    connection.transfer.departure,
                    connection.arrival
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
    // ODSTRANĚNÍ DUPLICITNÍCH ODJEZDŮ
    //
    // Stejný spoj se stejným časem nebude
    // nabízen několikrát.
    // =====================================================

    function removeSameDepartureDuplicates(
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

                connection.directionId,

                connection.secondLine || ""

            ].join("|");


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

            console.error(
                "Nejsou předány žádné linky."
            );

            return [];
        }


        const wantedTime =
            timeToMinutes(
                afterTime
            );


        // ================================================
        // NAČTENÍ VŠECH SPOJŮ
        // ================================================

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


        // ================================================
        // PŘÍMÉ
        // ================================================

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


        direct =
            removeSameDepartureDuplicates(
                direct
            );


        // ================================================
        // PŘESTUPY
        // ================================================

        let transfers =
            findTransferConnections(
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


        transfers =
            removeSameDepartureDuplicates(
                transfers
            );


        // ================================================
        // URČENÍ NEJLEPŠÍHO PŘÍMÉHO ČASU
        // ================================================

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


        // ================================================
        // PŘESTUPY
        //
        // Pokud existuje přímé spojení,
        // přestup zobrazíme pouze tehdy,
        // pokud dorazí dříve.
        //
        // Pokud přímé spojení neexistuje,
        // přestupy se normálně zobrazí.
        // ================================================

        if (
            direct.length > 0
        ) {

            transfers =
                transfers.filter(
                    connection =>
                        connection.arrivalMinutes <
                        fastestDirectArrival
                );

        }


        // ================================================
        // SPOJENÍ DO JEDNOHO POLE
        // ================================================

        let results = [

            ...direct,

            ...transfers

        ];


        // ================================================
        // SEŘAZENÍ
        // ================================================

        if (
            mode === "departure"
        ) {

            results.sort(
                (a, b) => {

                    const departureDifference =
                        a.departureMinutes -
                        b.departureMinutes;


                    if (
                        departureDifference !== 0
                    ) {
                        return departureDifference;
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


        // ================================================
        // OMEZENÍ VÝSLEDKŮ
        // ================================================

        results =
            results.slice(
                0,
                30
            );


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
            results
        );


        return results;
    }


    // =====================================================
    // EXPORT
    // =====================================================

    return {

        loadTimetable,

        findConnections,

        findDirectConnections,

        findTransferConnections

    };

})();
