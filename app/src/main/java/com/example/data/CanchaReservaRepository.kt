package com.example.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CanchaReservaRepository(
    private val sportComplexDao: SportComplexDao,
    private val matchSessionDao: MatchSessionDao,
    private val bookingDao: BookingDao,
    private val userProfileDao: UserProfileDao
) {
    val complexes: Flow<List<SportComplex>> = sportComplexDao.getAllComplexes()
    val matchSessions: Flow<List<MatchSession>> = matchSessionDao.getAllMatchSessions()
    val bookings: Flow<List<Booking>> = bookingDao.getAllBookings()
    val userProfile: Flow<UserProfile?> = userProfileDao.getUserProfile()

    suspend fun initDefaultDataIfEmpty() = withContext(Dispatchers.IO) {
        // 1. User profile setup
        val currentProfile = userProfile.firstOrNull()
        if (currentProfile == null) {
            userProfileDao.insertUserProfile(
                UserProfile(
                    id = 1,
                    name = "Carlos Mármol",
                    email = "carlosmarmol2172004@gmail.com",
                    walletBalance = 35000.0
                )
            )
        }

        // 2. Complexes setup
        val currentComplexes = complexes.firstOrNull()
        if (currentComplexes.isNullOrEmpty()) {
            val list = listOf(
                SportComplex(
                    name = "Club Pádel Pro",
                    sportType = "Pádel",
                    location = "Av. Las Condes 1020, Las Condes",
                    rating = 4.9f,
                    pricePerHour = 16000.0,
                    availTimesString = "17:00;18:00;19:00;21:00"
                ),
                SportComplex(
                    name = "Estadio Fútbol 7",
                    sportType = "Fútbol",
                    location = "Av. Vitacura 5400, Vitacura",
                    rating = 4.7f,
                    pricePerHour = 30000.0,
                    availTimesString = "19:00;21:00;22:00"
                ),
                SportComplex(
                    name = "Tenis Arena Chicureo",
                    sportType = "Tenis",
                    location = "Chicureo Oriente s/n, Colina",
                    rating = 4.6f,
                    pricePerHour = 12000.0,
                    availTimesString = "09:00;10:00;15:00;18:00"
                ),
                SportComplex(
                    name = "Palacio del Pádel",
                    sportType = "Pádel",
                    location = "Av. Bilbao 2300, Providencia",
                    rating = 4.8f,
                    pricePerHour = 18000.0,
                    availTimesString = "13:00;16:00;19:00;20:00"
                )
            )
            sportComplexDao.insertComplexes(list)
        }

        // 3. Match sessions setup
        val currentSessions = matchSessions.firstOrNull()
        if (currentSessions.isNullOrEmpty()) {
            matchSessionDao.insertMatchSession(
                MatchSession(
                    complexId = 1,
                    complexName = "Club Pádel Pro",
                    sportType = "Pádel",
                    schedule = "Hoy, 19:00 - 20:00",
                    creatorName = "Benjamín Vicuña",
                    description = "Falta 1 jugador para pádel americano nivel 4ta (intermedio). ¡Partido súper parejo y competitivo!",
                    slotsTotal = 4,
                    slotsTaken = 3,
                    pricePerPlayer = 4000.0,
                    joinedPlayerNamesString = "Benjamín, Felipe, Matías"
                )
            )
            matchSessionDao.insertMatchSession(
                MatchSession(
                    complexId = 2,
                    complexName = "Estadio Fútbol 7",
                    sportType = "Fútbol",
                    schedule = "Mañana, 20:00 - 21:00",
                    creatorName = "Lucas Sanhueza",
                    description = "Buscamos un arquero y un defensa para partido de fútbolito 7 contra 7, amistoso y de buen nivel.",
                    slotsTotal = 14,
                    slotsTaken = 12,
                    pricePerPlayer = 2150.0,
                    joinedPlayerNamesString = "Lucas, Pedro, Marcelo, Gabriel, Tomás, Ignacio, Franco, Javier, Sebastián, Andrés, Gonzalo, Juan"
                )
            )
            matchSessionDao.insertMatchSession(
                MatchSession(
                    complexId = 3,
                    complexName = "Tenis Arena Chicureo",
                    sportType = "Tenis",
                    schedule = "Esta tarde, 18:00 - 19:00",
                    creatorName = "Andrés Gómez",
                    description = "Salió partido de dobles de tenis. Nos falta una persona para jugar tenis dobles de nivel recreativo.",
                    slotsTotal = 4,
                    slotsTaken = 3,
                    pricePerPlayer = 3000.0,
                    joinedPlayerNamesString = "Andrés, Diego, Ricardo"
                )
            )
        }
    }

    suspend fun bookFullCourt(complex: SportComplex, scheduleTime: String): Boolean = withContext(Dispatchers.IO) {
        val profile = userProfile.firstOrNull() ?: return@withContext false
        val cost = complex.pricePerHour
        
        if (profile.walletBalance < cost) {
            return@withContext false // Insufficient funds
        }

        // Deduct money
        val updatedProfile = profile.copy(walletBalance = profile.walletBalance - cost)
        userProfileDao.updateUserProfile(updatedProfile)

        // Remove schedule from available times
        val timesList = complex.getAvailableTimes().toMutableList()
        timesList.remove(scheduleTime)
        val updatedTimesString = timesList.joinToString(";")
        
        val updatedComplex = complex.copy(availTimesString = updatedTimesString)
        sportComplexDao.insertComplex(updatedComplex)

        // Create booking
        val booking = Booking(
            complexName = complex.name,
            sportType = complex.sportType,
            schedule = "Reserva Cancha completa ($scheduleTime:00)",
            bookingType = "Cancha Completa",
            pricePaid = cost
        )
        bookingDao.insertBooking(booking)

        return@withContext true
    }

    suspend fun createMatchSession(
        complex: SportComplex,
        scheduleTime: String,
        description: String,
        slotsTotal: Int
    ): Boolean = withContext(Dispatchers.IO) {
        val profile = userProfile.firstOrNull() ?: return@withContext false
        val totalCost = complex.pricePerHour
        val pricePerPlayer = Math.round((totalCost / slotsTotal) * 100.0) / 100.0
        
        if (profile.walletBalance < pricePerPlayer) {
            return@withContext false // Insufficient funds to pay host share
        }

        // Deduct host's share
        val updatedProfile = profile.copy(walletBalance = profile.walletBalance - pricePerPlayer)
        userProfileDao.updateUserProfile(updatedProfile)

        // Remove schedule from available times for booking
        val timesList = complex.getAvailableTimes().toMutableList()
        timesList.remove(scheduleTime)
        val updatedTimesString = timesList.joinToString(";")
        val updatedComplex = complex.copy(availTimesString = updatedTimesString)
        sportComplexDao.insertComplex(updatedComplex)

        // Create the match session
        val matchSession = MatchSession(
            complexId = complex.id,
            complexName = complex.name,
            sportType = complex.sportType,
            schedule = "$scheduleTime:00",
            creatorName = profile.name,
            description = description.ifEmpty { "Partido exprés de ${complex.sportType} en ${complex.name}." },
            slotsTotal = slotsTotal,
            slotsTaken = 1,
            pricePerPlayer = pricePerPlayer,
            joinedPlayerNamesString = profile.name
        )
        matchSessionDao.insertMatchSession(matchSession)

        // Create host's Booking
        val booking = Booking(
            complexName = complex.name,
            sportType = complex.sportType,
            schedule = "Organizado ($scheduleTime:00)",
            bookingType = "Partido Exprés (Creador)",
            pricePaid = pricePerPlayer
        )
        bookingDao.insertBooking(booking)

        return@withContext true
    }

    suspend fun joinMatchSession(session: MatchSession): Boolean = withContext(Dispatchers.IO) {
        val profile = userProfile.firstOrNull() ?: return@withContext false
        
        if (session.slotsTaken >= session.slotsTotal) {
            return@withContext false // Already full
        }

        val cost = session.pricePerPlayer
        if (profile.walletBalance < cost) {
            return@withContext false // Insufficient funds
        }

        // Deduct player's share
        val updatedProfile = profile.copy(walletBalance = profile.walletBalance - cost)
        userProfileDao.updateUserProfile(updatedProfile)

        // Update match session
        val currentPlayers = session.getJoinedPlayerNames().toMutableList()
        currentPlayers.add(profile.name)
        val updatedPlayersString = currentPlayers.joinToString(", ")
        val updatedSession = session.copy(
            slotsTaken = session.slotsTaken + 1,
            joinedPlayerNamesString = updatedPlayersString
        )
        matchSessionDao.insertMatchSession(updatedSession)

        // Create booking
        val booking = Booking(
            complexName = session.complexName,
            sportType = session.sportType,
            schedule = "Partido Exprés con ${session.creatorName} (${session.schedule})",
            bookingType = "Partido Exprés (Unido)",
            pricePaid = cost
        )
        bookingDao.insertBooking(booking)

        return@withContext true
    }

    suspend fun addFunds(amount: Double): Boolean = withContext(Dispatchers.IO) {
        val profile = userProfile.firstOrNull() ?: return@withContext false
        val updatedProfile = profile.copy(walletBalance = profile.walletBalance + amount)
        userProfileDao.insertUserProfile(updatedProfile)
        return@withContext true
    }
}
