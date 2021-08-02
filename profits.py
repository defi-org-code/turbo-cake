
class ProfitCalc(object):
	DAYS_PER_YEAR = 365
	BLOCK_PER_SEC = 3
	SEC_IN_YEAR = DAYS_PER_YEAR * 24 * 3600
	BLOCKS_PER_YEAR = SEC_IN_YEAR / BLOCK_PER_SEC
	N_DAYS_POOL = 365
	FEE = .25 / 100 * 2

	COMPOUND_PERIOD = 365

	def __init__(self):
		super().__init__()

	@staticmethod
	def cng_pct(start, end):
		return 100 * (end / start - 1)

	def apy(self, apr, n, t=1.0):
		return 100 * ((1 + apr / 100 / n) ** (n*t) - 1)

	def pool_profit_for_period(self, rewards_per_block, rtoken_cake_rate, tvl):
		reward_for_period = self.BLOCKS_PER_YEAR * rewards_per_block * self.N_DAYS_POOL / self.DAYS_PER_YEAR
		cake_for_period = reward_for_period * rtoken_cake_rate * (1 - self.FEE)
		apr = self.cng_pct(tvl, tvl + cake_for_period) #* self.N_DAYS_POOL / self.DAYS_PER_YEAR
		apy = self.apy(apr, self.N_DAYS_POOL)

		print('apr = {}%, apy = {}%'.format(round(apr, 2), round(apy, 2)))

	def calc(self, **params):
		print(params)
		self.pool_profit_for_period(rewards_per_block=params['rewards_per_block'],
									rtoken_cake_rate=params['rtoken_cake_rate'],
									tvl=params['tvl'])


if __name__ == '__main__':
	pc = ProfitCalc()

	print(pc.apy(70, 365))
	# _params = {'rewards_per_block': 0.00744, 'rtoken_cake_rate': 46.3 / 14.83, 'tvl': 333844.219951991} # AXS
	_params = {'rewards_per_block': 12.86, 'rtoken_cake_rate': 0.78023 / 15.16, 'tvl': 1697072364759927113284710/1e18}  # SPS

	pc.calc(**_params)
