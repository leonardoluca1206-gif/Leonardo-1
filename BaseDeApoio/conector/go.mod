module baseapoio/conector

go 1.22.0

toolchain go1.24.7

require github.com/nakagami/firebirdsql v0.9.21

require (
	github.com/kardianos/osext v0.0.0-20190222173326-2bc1f35cddc0 // indirect
	github.com/nakagami/chacha20 v0.1.0 // indirect
	gitlab.com/nyarla/go-crypt v0.0.0-20160106005555-d9a5dc2b789b // indirect
	golang.org/x/text v0.22.0 // indirect
)

replace gitlab.com/nyarla/go-crypt => ./terceiros/go-crypt

replace golang.org/x/crypto => github.com/golang/crypto v0.31.0

replace golang.org/x/text => github.com/golang/text v0.21.0

replace golang.org/x/sys => github.com/golang/sys v0.28.0

replace golang.org/x/net => github.com/golang/net v0.33.0
